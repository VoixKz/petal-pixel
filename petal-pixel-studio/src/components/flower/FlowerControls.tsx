import { motion } from 'framer-motion';
import { useFlowerStore } from '@/stores/flowerStore';
import { Layers, Wand2, Palette, Play } from 'lucide-react';
import { BLOOM_TYPES, FLOWER_TYPES } from '@/math/flowerTypes';

function SliderControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono text-primary">{typeof value === 'number' ? value.toFixed(2) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

function ToggleControl({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-muted-foreground">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`w-9 h-5 rounded-full transition-colors relative ${
          value ? 'bg-primary' : 'bg-muted'
        }`}
      >
        <motion.div
          className="absolute top-0.5 w-4 h-4 rounded-full bg-foreground"
          animate={{ left: value ? 18 : 2 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      </div>
      <div className="space-y-3 pl-0.5">{children}</div>
    </div>
  );
}

export function FlowerControls() {
  const { params, setParam, setFlowerType, setClassicParam, setRoseParam, setBloomParam } = useFlowerStore();

  const isRose = params.flowerType === 'rose';
  const isBloom = BLOOM_TYPES.includes(params.flowerType);

  return (
    <aside className="w-72 h-full bg-card border-l border-border flex flex-col shrink-0">
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Flower Controls</h2>
        <p className="text-[10px] text-muted-foreground mt-0.5">Adjust parameters in real-time</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <Section title="Geometry" icon={Layers}>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Technique</span>
            <div className="grid grid-cols-2 gap-1.5">
              {FLOWER_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setFlowerType(type)}
                  className={`text-[10px] py-1.5 rounded-md capitalize transition-colors ${
                    params.flowerType === type
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-muted'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>
          <SliderControl label="Petal Count" value={params.petalCount} min={3} max={20} step={1} onChange={(v) => setParam('petalCount', v)} />
          <SliderControl label="Petal Length" value={params.petalLength} min={0.3} max={2.5} step={0.05} onChange={(v) => setParam('petalLength', v)} />
          <SliderControl label="Petal Sharpness" value={params.petalSharpness} min={0} max={1} onChange={(v) => setParam('petalSharpness', v)} />
          <ToggleControl label="Stem (coming soon)" value={params.stemEnabled} onChange={(v) => setParam('stemEnabled', v)} />
        </Section>

        <div className="h-px bg-border" />

        <Section title="Math Parameters" icon={Wand2}>
          {!isRose && !isBloom && (
            <>
              <SliderControl label="Classic Petals (pNum)" value={params.classicParams.pNum} min={1} max={20} step={1} onChange={(v) => setClassicParam('pNum', v)} />
              <SliderControl label="Diameter" value={params.classicParams.fD} min={20} max={250} step={1} onChange={(v) => setClassicParam('fD', v)} />
              <SliderControl label="Curve 1" value={params.classicParams.curve1} min={0} max={4} step={0.1} onChange={(v) => setClassicParam('curve1', v)} />
              <SliderControl label="Curve 2" value={params.classicParams.curve2} min={0} max={1} step={0.05} onChange={(v) => setClassicParam('curve2', v)} />
              <SliderControl label="Bumpiness" value={params.classicParams.b} min={0} max={5} step={0.1} onChange={(v) => setClassicParam('b', v)} />
            </>
          )}

          {isRose && (
            <>
              <SliderControl label="Opening" value={params.roseParams.opening} min={1} max={10} step={0.1} onChange={(v) => setRoseParam('opening', v)} />
              <SliderControl label="Vertical Density" value={params.roseParams.vDensity} min={1} max={20} step={0.1} onChange={(v) => setRoseParam('vDensity', v)} />
              <SliderControl label="Petal Align" value={params.roseParams.pAlign} min={0} max={6} step={0.05} onChange={(v) => setRoseParam('pAlign', v)} />
              <SliderControl label="Curve 1" value={params.roseParams.curve1} min={-6} max={6} step={0.1} onChange={(v) => setRoseParam('curve1', v)} />
              <SliderControl label="Curve 2" value={params.roseParams.curve2} min={0.5} max={1.5} step={0.1} onChange={(v) => setRoseParam('curve2', v)} />
            </>
          )}

          {isBloom && (
            <>
              <SliderControl label="Scale" value={params.bloomParams.scale} min={120} max={420} step={1} onChange={(v) => setBloomParam('scale', v)} />
              <SliderControl label="Opening" value={params.bloomParams.opening} min={0.4} max={2.4} step={0.05} onChange={(v) => setBloomParam('opening', v)} />
              <SliderControl label="Density" value={params.bloomParams.density} min={0.4} max={2.4} step={0.05} onChange={(v) => setBloomParam('density', v)} />
              <SliderControl label="Petal Frequency" value={params.bloomParams.petalFreq} min={0.4} max={2.2} step={0.05} onChange={(v) => setBloomParam('petalFreq', v)} />
              <SliderControl label="Petal Amplitude" value={params.bloomParams.petalAmp} min={0.4} max={2.2} step={0.05} onChange={(v) => setBloomParam('petalAmp', v)} />
              <SliderControl label="Hang Down" value={params.bloomParams.hangDown} min={0.3} max={2.8} step={0.05} onChange={(v) => setBloomParam('hangDown', v)} />
              <SliderControl label="Spiral Fade" value={params.bloomParams.fade} min={0.4} max={1.8} step={0.05} onChange={(v) => setBloomParam('fade', v)} />
            </>
          )}

          <SliderControl label="Noise Intensity" value={params.noiseIntensity} min={0} max={1} onChange={(v) => setParam('noiseIntensity', v)} />
          <SliderControl label="Frequency" value={params.frequency} min={1} max={10} step={0.5} onChange={(v) => setParam('frequency', v)} />
          <SliderControl label="Rotation" value={params.rotation} min={0} max={360} step={1} onChange={(v) => setParam('rotation', v)} />
          <SliderControl label="Symmetry" value={params.symmetry} min={2} max={12} step={1} onChange={(v) => setParam('symmetry', v)} />
        </Section>

        <div className="h-px bg-border" />

        <Section title="Colors" icon={Palette}>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Primary</span>
              <input
                type="color"
                value={params.colorA}
                onChange={(e) => setParam('colorA', e.target.value)}
                className="w-8 h-6 rounded border border-border cursor-pointer bg-transparent"
              />
            </div>
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Secondary</span>
              <input
                type="color"
                value={params.colorB}
                onChange={(e) => setParam('colorB', e.target.value)}
                className="w-8 h-6 rounded border border-border cursor-pointer bg-transparent"
              />
            </div>
          </div>
          <SliderControl label="Glow Intensity" value={params.glowIntensity} min={0} max={1} onChange={(v) => setParam('glowIntensity', v)} />
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">Material</span>
            <div className="flex gap-1.5">
              {(['glass', 'matte', 'metallic'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setParam('material', m)}
                  className={`flex-1 text-[10px] py-1.5 rounded-md capitalize transition-colors ${
                    params.material === m
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-muted'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </Section>

        <div className="h-px bg-border" />

        <Section title="Animation" icon={Play}>
          <ToggleControl label="Idle Motion" value={params.idleMotion} onChange={(v) => setParam('idleMotion', v)} />
          <SliderControl label="Rotation Speed" value={params.rotationSpeed} min={0} max={3} step={0.1} onChange={(v) => setParam('rotationSpeed', v)} />
        </Section>
      </div>
    </aside>
  );
}
