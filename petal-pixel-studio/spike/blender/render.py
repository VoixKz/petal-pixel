# Renders exported plants in Cycles. Runs in its own background Blender, so the scene open
# in the app is left alone. See README.md for the shape of jobs.json.
# Blender -b --factory-startup --python spike/blender/render.py -- jobs.json
import json, math, os, sys
import bpy
import numpy as np
from mathutils import Vector

jobs = json.load(open(sys.argv[sys.argv.index("--") + 1]))

prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "METAL"
prefs.get_devices()
for device in prefs.devices:
    device.use = device.type == "METAL"

scene = bpy.context.scene
scene.render.engine = "CYCLES"
c = scene.cycles
c.device = "GPU"
c.use_adaptive_sampling = True
c.adaptive_threshold = 0.008
c.use_denoising = True
c.denoiser = "OPENIMAGEDENOISE"
c.max_bounces = 18
c.diffuse_bounces = 10
c.glossy_bounces = 4
c.transmission_bounces = 12
c.transparent_max_bounces = 8
c.caustics_reflective = False
c.caustics_refractive = False
c.filter_width = 1.2
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.color_depth = "8"
try:
    scene.view_settings.view_transform = "Khronos PBR Neutral"
except TypeError:
    scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"

for obj in list(bpy.data.objects):
    bpy.data.objects.remove(obj)

camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.sensor_fit = "VERTICAL"

def to_z_up(p):
    return Vector((p[0], -p[2], p[1]))

def aim(position, look, fov=30):
    camera.location = to_z_up(position)
    direction = to_z_up(look) - to_z_up(position)
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.angle_y = math.radians(fov)

def lights_out():
    for obj in list(bpy.data.objects):
        if obj.type == "LIGHT":
            bpy.data.objects.remove(obj)

def sun(direction, strength, colour, angle):
    light = bpy.data.lights.new("Sun", "SUN")
    light.energy = strength
    light.color = colour
    light.angle = math.radians(angle)
    obj = bpy.data.objects.new("Sun", light)
    scene.collection.objects.link(obj)
    obj.rotation_euler = to_z_up(direction).to_track_quat("Z", "Y").to_euler()
    return obj

def sky(top, bottom, strength):
    world = bpy.data.worlds.get("Sky") or bpy.data.worlds.new("Sky")
    world.use_nodes = True
    tree = world.node_tree
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputWorld")
    background = tree.nodes.new("ShaderNodeBackground")
    coords = tree.nodes.new("ShaderNodeTexCoord")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*bottom, 1)
    ramp.color_ramp.elements[1].position = 0.65
    ramp.color_ramp.elements[1].color = (*top, 1)
    remap = tree.nodes.new("ShaderNodeMath")
    remap.operation = "MULTIPLY_ADD"
    remap.inputs[1].default_value = 0.5
    remap.inputs[2].default_value = 0.5
    tree.links.new(coords.outputs["Generated"], split.inputs[0])
    tree.links.new(split.outputs["Z"], remap.inputs[0])
    tree.links.new(remap.outputs[0], ramp.inputs[0])
    tree.links.new(ramp.outputs[0], background.inputs[0])
    background.inputs[1].default_value = strength
    tree.links.new(background.outputs[0], output.inputs[0])
    scene.world = world

def material(kind, colours):
    mat = bpy.data.materials.get(kind) or bpy.data.materials.new(kind)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    n = tree.nodes.new
    l = tree.links.new
    output = n("ShaderNodeOutputMaterial")
    pbr = n("ShaderNodeBsdfPrincipled")
    if kind in ("petal", "sepal", "stamen", "leaf", "stem"):
        col = n("ShaderNodeAttribute")
        col.attribute_name = "Col"
        colour = col.outputs["Color"]
    if kind in ("petal", "sepal"):
        grid = n("ShaderNodeAttribute")
        grid.attribute_name = "Grid"
        xy = n("ShaderNodeSeparateXYZ")
        l(grid.outputs["Vector"], xy.inputs[0])
        def op(name, a, b=None):
            m = n("ShaderNodeMath")
            m.operation = name
            for slot, value in enumerate((a, b)):
                if value is None:
                    continue
                if isinstance(value, (int, float)):
                    m.inputs[slot].default_value = value
                else:
                    l(value, m.inputs[slot])
            return m.outputs[0]
        u, v = xy.outputs["X"], xy.outputs["Y"]
        # The same fine veins as the page, as real relief.
        ribs = op("SINE", op("ADD", op("MULTIPLY", u, op("ADD", 14, op("MULTIPLY", v, 40))), op("MULTIPLY", 2, op("SINE", op("MULTIPLY", u, 7)))))
        folds = op("SINE", op("ADD", op("MULTIPLY", u, 3.6), op("MULTIPLY", v, 3)))
        bump = n("ShaderNodeBump")
        bump.inputs["Distance"].default_value = 0.0016
        l(op("ADD", op("MULTIPLY", ribs, 0.22), op("MULTIPLY", folds, 2.4)), bump.inputs["Height"])
        l(bump.outputs[0], pbr.inputs["Normal"])
        translucent = n("ShaderNodeBsdfTranslucent")
        # Light through a petal takes its hue, not its darkness: at night a deep colour passes
        # as much of the lamp as a pale one, as the page's "through" does.
        channels = n("ShaderNodeSeparateColor")
        l(colour, channels.inputs[0])
        strongest = op("MAXIMUM", op("MAXIMUM", channels.outputs[0], channels.outputs[1]), channels.outputs[2])
        evened = n("ShaderNodeMix")
        evened.data_type = "RGBA"
        evened.blend_type = "DIVIDE"
        evened.name = "Evened"
        evened.inputs["Factor"].default_value = 0
        l(colour, evened.inputs["A"])
        l(strongest, evened.inputs["B"])
        richer = n("ShaderNodeHueSaturation")
        richer.inputs["Saturation"].default_value = 1.3
        l(evened.outputs["Result"], richer.inputs["Color"])
        l(richer.outputs[0], translucent.inputs["Color"])
        l(bump.outputs[0], translucent.inputs["Normal"])
        both = n("ShaderNodeMixShader")
        both.inputs[0].default_value = 0.46 if kind == "petal" else 0.2
        l(pbr.outputs[0], both.inputs[1])
        l(translucent.outputs[0], both.inputs[2])
        # At night every petal passes on the light it receives, so the lamp's glow gets through
        # the whole stack, and the petals light one another for real.
        glow = n("ShaderNodeValue")
        glow.name = "Glow"
        glow.outputs[0].default_value = 0
        near = n("ShaderNodeAttribute")
        near.attribute_name = "Near"
        deep = n("ShaderNodeHueSaturation")
        deep.inputs["Saturation"].default_value = 1.5
        l(colour, deep.inputs["Color"])
        warm = n("ShaderNodeMix")
        warm.data_type = "RGBA"
        warm.blend_type = "MULTIPLY"
        warm.inputs["Factor"].default_value = 1
        warm.inputs["B"].default_value = (1.0, 0.74, 0.52, 1)
        l(deep.outputs[0], warm.inputs["A"])
        emission = n("ShaderNodeEmission")
        l(warm.outputs["Result"], emission.inputs["Color"])
        l(op("MULTIPLY", near.outputs["Fac"], op("MULTIPLY", glow.outputs[0], 1 if kind == "petal" else 0.25)), emission.inputs["Strength"])
        add = n("ShaderNodeAddShader")
        l(both.outputs[0], add.inputs[0])
        l(emission.outputs[0], add.inputs[1])
        l(add.outputs[0], output.inputs["Surface"])
        l(colour, pbr.inputs["Base Color"])
        pbr.inputs["Roughness"].default_value = 0.52
        pbr.inputs["Specular IOR Level"].default_value = 0.32
        pbr.inputs["Sheen Weight"].default_value = 0.35
        pbr.inputs["Sheen Roughness"].default_value = 0.45
    elif kind == "leaf":
        back = n("ShaderNodeNewGeometry")
        pale = n("ShaderNodeMix")
        pale.data_type = "RGBA"
        pale.inputs["B"].default_value = (*colours["bright"], 1)
        ramp = n("ShaderNodeMath")
        ramp.operation = "MULTIPLY"
        ramp.inputs[1].default_value = 0.42
        l(back.outputs["Backfacing"], ramp.inputs[0])
        l(ramp.outputs[0], pale.inputs["Factor"])
        l(colour, pale.inputs["A"])
        l(pale.outputs["Result"], pbr.inputs["Base Color"])
        pbr.inputs["Roughness"].default_value = 0.46
        translucent = n("ShaderNodeBsdfTranslucent")
        l(pale.outputs["Result"], translucent.inputs["Color"])
        both = n("ShaderNodeMixShader")
        both.inputs[0].default_value = 0.22
        l(pbr.outputs[0], both.inputs[1])
        l(translucent.outputs[0], both.inputs[2])
        l(both.outputs[0], output.inputs["Surface"])
    else:
        if kind in ("stamen", "stem"):
            l(colour, pbr.inputs["Base Color"])
        else:
            pbr.inputs["Base Color"].default_value = (*colours[kind], 1)
        pbr.inputs["Roughness"].default_value = {"heart": 1.0, "stem": 0.5, "thorn": 0.45}.get(kind, 0.7)
        pbr.inputs["Specular IOR Level"].default_value = 0.0 if kind == "heart" else 0.4
        l(pbr.outputs[0], output.inputs["Surface"])
    return mat

def plant(manifest_path):
    for obj in list(bpy.data.objects):
        if obj.type == "MESH" or obj.type == "EMPTY":
            bpy.data.objects.remove(obj)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    m = json.load(open(manifest_path))
    data = np.fromfile(manifest_path[:-5] + ".bin", dtype=np.uint8)
    root = bpy.data.objects.new("Plant", None)
    scene.collection.objects.link(root)
    root.rotation_euler = (math.pi / 2, 0, 0)
    for e in m["meshes"]:
        n, t = e["vertices"], e["triangles"]
        positions = np.frombuffer(data, np.float32, n * 3, e["positions"])
        indices = np.frombuffer(data, np.uint32, t * 3, e["indices"])
        me = bpy.data.meshes.new(e["name"])
        me.vertices.add(n)
        me.vertices.foreach_set("co", positions)
        me.loops.add(t * 3)
        me.loops.foreach_set("vertex_index", indices.astype(np.int32))
        me.polygons.add(t)
        me.polygons.foreach_set("loop_start", np.arange(0, t * 3, 3, dtype=np.int32))
        me.update(calc_edges=True)
        me.polygons.foreach_set("use_smooth", np.ones(t, dtype=bool))
        if e["colours"] is not None:
            rgb = np.frombuffer(data, np.float32, n * 3, e["colours"]).reshape(-1, 3)
            rgba = np.concatenate([rgb, np.ones((n, 1), np.float32)], axis=1)
            me.color_attributes.new("Col", "FLOAT_COLOR", "POINT").data.foreach_set("color", rgba.ravel())
        if e["grid"] is not None:
            me.attributes.new("Grid", "FLOAT2", "POINT").data.foreach_set("vector", np.frombuffer(data, np.float32, n * 2, e["grid"]))
            away = np.linalg.norm(positions.reshape(-1, 3) - np.array(m["lamp"], np.float32), axis=1)
            me.attributes.new("Near", "FLOAT", "POINT").data.foreach_set("value", np.exp(-away * 1.5).astype(np.float32))
        me.validate(clean_customdata=False)
        me.materials.append(material(e["material"], m["colours"]))
        obj = bpy.data.objects.new(e["name"], me)
        scene.collection.objects.link(obj)
        obj.parent = root
    return m

def light_day():
    lights_out()
    sky((1.0, 1.0, 1.0), (0.72, 0.64, 0.52), 0.6)
    sun((3, 7, 4), 3.1, (1.0, 0.96, 0.9), 6)
    sun((-4, 2, -3), 0.55, (0.74, 0.8, 1.0), 24)

def glow_all(amount):
    for mat in bpy.data.materials:
        node = mat.node_tree.nodes.get("Glow") if mat.node_tree else None
        if node:
            node.outputs[0].default_value = amount

def even_all(amount):
    for mat in bpy.data.materials:
        node = mat.node_tree.nodes.get("Evened") if mat.node_tree else None
        if node:
            node.inputs["Factor"].default_value = amount

def lamp_at(m, power, colour, radius, shadows):
    lamp = bpy.data.lights.new("Lamp", "POINT")
    lamp.energy = power
    lamp.color = colour
    lamp.shadow_soft_size = radius
    lamp.use_shadow = shadows
    obj = bpy.data.objects.new("Lamp", lamp)
    scene.collection.objects.link(obj)
    obj.location = to_z_up(m["lamp"])
    obj.visible_camera = False

def light_night(m, power):
    lights_out()
    sky((0.01, 0.01, 0.0095), (0.01, 0.01, 0.0095), 1.0)
    # A lampshade passes light through every layer, which a single bulb in a stack of petals
    # never would. This lamp ignores what stands in its way, so each face is lit by how it
    # turns to the bulb and how far it is. The second one adds the real shadows between layers.
    lamp_at(m, power, (1.0, 0.72, 0.5), 0.34, False)
    lamp_at(m, power * 0.5, (1.0, 0.66, 0.4), 0.06, True)

loaded = None
for job in jobs:
    if loaded is None or loaded["path"] != job["plant"]:
        loaded = {"path": job["plant"], "manifest": plant(job["plant"])}
    m = loaded["manifest"]
    h = m["heart"]
    if job["frame"] == "lamp":
        aim((h[0], h[1] + 0.3, h[2] + 7.4), (h[0], h[1] - 0.72, h[2]))
    elif job["frame"] == "cover":
        aim((h[0] - 0.62, h[1] + 0.86, h[2] + 3.5), (h[0] - 0.62, h[1] - 0.02, h[2]))
    elif job["frame"] == "close":
        aim((h[0], h[1] + 1.0, h[2] + 3.3), (h[0], h[1] - 0.05, h[2]))
    else:
        aim((h[0], h[1] + 1, h[2] + 4.6), (h[0], h[1] - 0.16, h[2]))
    if job["night"]:
        light_night(m, job.get("power", 22))
        glow_all(job.get("glow", 0))
        even_all(1)
    else:
        light_day()
        glow_all(0)
        even_all(0)
    scene.render.resolution_x = job["width"]
    scene.render.resolution_y = job["height"]
    scene.render.resolution_percentage = 100
    c.samples = job.get("samples", 256)
    scene.render.filepath = job["out"]
    bpy.ops.render.render(write_still=True)
    print("RENDERED", job["out"], flush=True)
