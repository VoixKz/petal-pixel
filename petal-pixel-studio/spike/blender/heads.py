# Turns a downloaded flower into a head the page can grow: its base at the origin, its axis
# up, radius 1, no cut stalk, few enough triangles for a phone. Runs in its own background
# Blender, so the scene open in the app is left alone. See README.md.
# Blender -b --factory-startup --disable-autoexec --python spike/blender/heads.py -- job.json out_dir
import json, math, os, sys
import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

args = sys.argv[sys.argv.index("--") + 1:]
job = json.load(open(args[0]))
out_dir = args[1]

scene = bpy.context.scene
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=job["path"])
bpy.context.view_layer.update()


def surface(mat):
    """Scans often arrive unlit, with the photo's light baked in. The page needs a real surface."""
    tree = mat.node_tree
    tex = next((n for n in tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
    out = next((n for n in tree.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if tex is None or out is None:
        return
    keep = {tex, out}
    for node in [n for n in tree.nodes if n not in keep]:
        tree.nodes.remove(node)
    pbr = tree.nodes.new("ShaderNodeBsdfPrincipled")
    pbr.inputs["Roughness"].default_value = 0.6
    tree.links.new(tex.outputs[0], pbr.inputs["Base Color"])
    tree.links.new(pbr.outputs[0], out.inputs["Surface"])


prefix = job.get("only_material")
for o in [o for o in scene.objects if o.type == "MESH"]:
    name = o.data.materials[0].name if o.data.materials else ""
    wanted = len(o.data.vertices) >= job.get("min_verts", 100)
    if prefix:
        wanted = wanted and any(name.startswith(p) for p in ([prefix] if isinstance(prefix, str) else prefix))
    if job.get("only_objects"):
        wanted = wanted and any(o.name.startswith(p) for p in job["only_objects"])
    if not wanted:
        bpy.data.objects.remove(o)
meshes = [o for o in scene.objects if o.type == "MESH"]
for m in bpy.data.materials:
    if m.users and m.node_tree:
        surface(m)

bpy.ops.object.select_all(action="DESELECT")
for o in meshes:
    o.select_set(True)
    o.data = o.data.copy()
bpy.context.view_layer.objects.active = meshes[0]
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
if len(meshes) > 1:
    bpy.ops.object.join()
head = bpy.context.view_layer.objects.active
mesh = head.data
if "custom_normal" in mesh.attributes:
    mesh.attributes.remove(mesh.attributes["custom_normal"])


def points():
    co = np.empty(len(mesh.vertices) * 3)
    mesh.vertices.foreach_get("co", co)
    return co.reshape(-1, 3)


def keep_only(mask):
    """Drops vertices by mask, faces with them, and whatever is left hanging."""
    import bmesh

    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in np.nonzero(~mask)[0]], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()


def pieces():
    """Which connected piece each vertex belongs to, by spreading the lowest label along edges."""
    e = np.empty(len(mesh.edges) * 2, dtype=np.int64)
    mesh.edges.foreach_get("vertices", e)
    a, b = e[0::2], e[1::2]
    label = np.arange(len(mesh.vertices))
    while True:
        low = label.copy()
        np.minimum.at(low, a, label[b])
        np.minimum.at(low, b, label[a])
        low = low[low]
        if np.array_equal(low, label):
            return label
        label = low


if "sphere" in job:
    centre = np.array(job["sphere"][:3], float)
    inside = np.linalg.norm(points() - centre, axis=1) < job["sphere"][3]
    if job.get("whole_pieces"):
        # Keep a petal whole or not at all: a sphere's edge would slice straight through it.
        label = pieces()
        share = np.bincount(label, weights=inside, minlength=len(label)) / np.maximum(np.bincount(label, minlength=len(label)), 1)
        inside = share[label] > 0.6
    if "above_z" in job:
        inside &= points()[:, 2] > job["above_z"]
    keep_only(inside)

co = points()
if "axis" in job:
    axis = np.array(job["axis"], float)
    axis /= np.linalg.norm(axis)
    centre = np.median(co, axis=0)
elif job.get("head_from") is not None:
    z0, z1 = co[:, 2].min(), co[:, 2].max()
    cut = z0 + (z1 - z0) * job["head_from"]
    top = co[:, 2] > cut
    neck = (co[:, 2] > cut - (z1 - z0) * 0.12) & (co[:, 2] < cut)
    centre = co[top].mean(axis=0)
    axis = centre - co[neck].mean(axis=0)
    axis /= np.linalg.norm(axis)
    co = co[top]
else:
    # Most flowers stand upright in their scan; the far end of the cloud is the stalk.
    centre = np.median(co, axis=0)
    axis = np.array((0.0, 0.0, 1.0))

h = (co - centre) @ axis
across = np.linalg.norm((co - centre) - np.outer(h, axis), axis=1)
bins = np.linspace(np.percentile(h, 0.2), np.percentile(h, 99.8), 61)
which = np.digitize(h, bins)
profile = [float(np.percentile(across[which == b], 90)) if (which == b).sum() > 20 else 0.0 for b in range(1, 61)]
stalk = float(np.median([x for x in profile[:4] if x > 0] or [1e-6]))
first = next((i for i, x in enumerate(profile) if x > stalk * job.get("flare", 1.7)), 0)
base = float(bins[first]) + job.get("base_lift", 0.0)
pivot = centre + axis * base
if "pivot" in job:
    pivot = np.array(job["pivot"], float)

# Stand it up: pivot at the origin, axis along Z, which glTF export turns into the page's Y.
turn = Vector(axis).rotation_difference(Vector((0, 0, 1))).to_matrix().to_4x4()
mesh.transform(turn @ Matrix.Translation(Vector(-pivot)))
co = points()
top = co[:, 2] > 0
radius = float(np.percentile(np.linalg.norm(co[top], axis=1), 99))
mesh.transform(Matrix.Scale(1 / radius, 4))
co = points()

def vertex_colours():
    """Each vertex's colour in the texture of its own face, since a scan can carry several."""
    pictures = []
    for mat in mesh.materials:
        img = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
        w, h2 = img.size
        px = np.empty(w * h2 * img.channels, dtype=np.float32)
        img.pixels.foreach_get(px)
        pictures.append((px.reshape(h2, w, img.channels)[:, :, :3], w, h2))
    uv = np.empty(len(mesh.loops) * 2)
    mesh.uv_layers[0].data.foreach_get("uv", uv)
    uv = uv.reshape(-1, 2)
    vi = np.empty(len(mesh.loops), dtype=np.int32)
    mesh.loops.foreach_get("vertex_index", vi)
    starts = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_start", starts)
    totals = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("loop_total", totals)
    which_mat = np.empty(len(mesh.polygons), dtype=np.int32)
    mesh.polygons.foreach_get("material_index", which_mat)
    loop_mat = np.repeat(which_mat, totals)
    out = np.full((len(mesh.vertices), 3), 0.5)
    for i, (px, w, h2) in enumerate(pictures):
        at = loop_mat == i
        x = np.clip((uv[at, 0] % 1) * w, 0, w - 1).astype(int)
        y = np.clip((uv[at, 1] % 1) * h2, 0, h2 - 1).astype(int)
        out[vi[at]] = px[y, x]
    return out


def drop_crumbs(share):
    """Cutting a leaf away leaves crumbs floating in the air. Only real pieces stay."""
    label = pieces()
    values, counts = np.unique(label, return_counts=True)
    big = values[counts >= max(40, len(label) * share)]
    keep_only(np.isin(label, big))


# Leaves caught behind a bloom go; the green right at its base stays as the calyx.
if "drop_green_beyond" in job:
    c = vertex_colours()
    leafy = (c[:, 1] > c[:, 0] * 1.04) & (c[:, 1] > c[:, 2] * 1.12)
    keep_only(~(leafy & (np.linalg.norm(co, axis=1) > job["drop_green_beyond"])))
    co = points()

# When a leaf is too dark or grey to read as green, name the petals' colour instead.
if "petals_beyond" in job:
    c = vertex_colours()
    rule = job["petals_beyond"]
    petals = np.ones(len(c), dtype=bool)
    if "green_under" in rule:
        petals &= c[:, 1] < c[:, 0] * rule["green_under"]
    if "blue_under" in rule:
        petals &= c[:, 2] < c[:, 1] * rule["blue_under"]
    if "blue_over" in rule:
        petals &= c[:, 2] > c[:, 1] * rule["blue_over"]
    keep_only(petals | (np.linalg.norm(co, axis=1) <= rule["r"]))
    co = points()

if "cut_all_below" in job:
    keep_only(co[:, 2] > job["cut_all_below"])
    co = points()

# What lies under the base is cut stalk; the page grows its own stem.
below = job.get("cut_below", -0.04)
keep_only((co[:, 2] > below) | (np.linalg.norm(co[:, :2], axis=1) > job.get("stalk_radius", stalk / radius * 1.4)))

bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=job.get("weld", 0.0006), use_unselected=False, use_sharp_edge_from_normals=False)
bpy.ops.mesh.delete_loose()
bpy.ops.object.mode_set(mode="OBJECT")
drop_crumbs(job.get("crumb", 0.002))

mesh.calc_loop_triangles()
tris = len(mesh.loop_triangles)
target = job.get("tris", 60000)
if tris > target:
    mod = head.modifiers.new("Fewer", "DECIMATE")
    mod.decimate_type = "COLLAPSE"
    mod.ratio = target / tris
    bpy.ops.object.modifier_apply(modifier=mod.name)
head.data.shade_smooth()
mesh = head.data
mesh.calc_loop_triangles()

co = points()
top = co[:, 2] > 0
phi = np.arctan2(np.linalg.norm(co[:, :2], axis=1), co[:, 2])
phi_top = float(np.percentile(phi[top], job.get("phi_pct", 98)))


def sample_colours():
    """The flower's own colours, heart to tip, for the page's swatches."""
    col = vertex_colours()
    dist = np.linalg.norm(co, axis=1)
    out = []
    for low, high in ((0.0, 0.45), (0.45, 0.8), (0.8, 1.2)):
        m = top & (dist >= low) & (dist < high)
        c = np.median(col[m], axis=0) if m.any() else np.array((0.5, 0.5, 0.5))
        out.append("#%02x%02x%02x" % tuple(int(round(255 * float(np.clip(v, 0, 1)))) for v in c))
    return out


colours = sample_colours()
os.makedirs(out_dir, exist_ok=True)
target_path = os.path.join(out_dir, f'{job["id"]}.glb')
bpy.ops.object.select_all(action="DESELECT")
head.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=target_path,
    use_selection=True,
    export_format="GLB",
    export_yup=True,
    export_apply=True,
    export_image_format="WEBP",
    export_image_quality=job.get("quality", 82),
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=13,
    export_draco_normal_quantization=9,
    export_draco_texcoord_quantization=12,
)
print(
    "HEAD",
    json.dumps(
        {
            "id": job["id"],
            "tris": len(mesh.loop_triangles),
            "phiTop": round(phi_top, 3),
            "kb": round(os.path.getsize(target_path) / 1024),
            "colours": colours,
        }
    ),
    flush=True,
)
