/**
 * Asteroid generation Web Worker.
 *
 * Runs the CPU-intensive noise + voxel computation off the main thread so the
 * loading spinner stays smooth.  All constants (noise octaves, scales, etc.) are
 * passed in the message payload — no imports needed, keeping the bundle tiny.
 *
 * Message protocol
 * ─────────────────
 * Main → Worker  { type: 'generate', id: string, params: GenParams }
 * Worker → Main  { type: 'result',   id: string,
 *                  integrityFlat: ArrayBuffer,    // Uint8Array, sizeCells²
 *                  hardnessFlat:  ArrayBuffer,    // Uint8Array, sizeCells²
 *                  metalIndexFlat:  ArrayBuffer }  // Uint8Array, sizeCells² (argmax metal index per cell)
 *               + transferable list [integrityFlat, hardnessFlat, metalIndexFlat]
 */

// ---------------------------------------------------------------------------
// Inline Perlin 3D noise — mirrors createNoise3D() in mining.service.ts
// ---------------------------------------------------------------------------
function makeNoise3D(seed, octaves, persistence, lacunarity) {
  const gradients3D = [
    [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
    [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
    [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
  ];

  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + t * (b - a);
  const grad = (hash, x, y, z) => {
    const g = gradients3D[hash % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };

  const seededShuffle = (arr, s) => {
    const rnd = n => { n = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return n - Math.floor(n); };
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(s + i) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  };

  const p = Array.from({ length: 256 }, (_, i) => i);
  seededShuffle(p, seed);
  const perm = p.concat(p);

  const perlin3D = (x, y, z) => {
    const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255, zi = Math.floor(z) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y), zf = z - Math.floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const aaa = perm[perm[perm[xi]     + yi]     + zi];
    const baa = perm[perm[perm[xi + 1] + yi]     + zi];
    const aba = perm[perm[perm[xi]     + yi + 1] + zi];
    const bba = perm[perm[perm[xi + 1] + yi + 1] + zi];
    const aab = perm[perm[perm[xi]     + yi]     + zi + 1];
    const bab = perm[perm[perm[xi + 1] + yi]     + zi + 1];
    const abb = perm[perm[perm[xi]     + yi + 1] + zi + 1];
    const bbb = perm[perm[perm[xi + 1] + yi + 1] + zi + 1];
    let x1 = lerp(grad(aaa, xf,     yf,     zf),     grad(baa, xf - 1, yf,     zf), u);
    let x2 = lerp(grad(aba, xf,     yf - 1, zf),     grad(bba, xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);
    x1 = lerp(grad(aab, xf,     yf,     zf - 1), grad(bab, xf - 1, yf,     zf - 1), u);
    x2 = lerp(grad(abb, xf,     yf - 1, zf - 1), grad(bbb, xf - 1, yf - 1, zf - 1), u);
    const y2 = lerp(x1, x2, v);
    return lerp(y1, y2, w);
  };

  return (x, y, z) => {
    let value = 0, amplitude = 1, frequency = 1;
    for (let i = 0; i < octaves; i++) {
      value += perlin3D(x * frequency, y * frequency, z * frequency) * amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return (value + 1) / 2;
  };
}

// ---------------------------------------------------------------------------
// Core voxel generation — mirrors Asteroid.generateData() logic exactly
// ---------------------------------------------------------------------------
function generateAsteroidData(params) {
  const {
    seed, sizeCells, metalCount, metals,
    bodyRadiusCells, hardnessScale, metalScale,
    distanceBias, factionRelation,
    noiseOctaves, noisePersistence, noiseLacunarity,
    premiumMetalBias,
  } = params;

  const getNoise = offset =>
    makeNoise3D(seed + offset, noiseOctaves, noisePersistence, noiseLacunarity);

  const hardnessNoise = getNoise(1);
  const metalNoises   = Array.from({ length: metalCount }, (_, m) => getNoise(2 + m));

  const numCells          = sizeCells * sizeCells;
  const integrityFlat     = new Uint8Array(numCells);
  const hardnessFlat      = new Uint8Array(numCells);
  const metalIndexFlat    = new Uint8Array(numCells);

  const halfW = sizeCells * 0.5;
  const halfH = sizeCells * 0.5;
  const maxRLocal = Math.min(halfW, halfH);

  for (let gy = 0; gy < sizeCells; gy++) {
    for (let gx = 0; gx < sizeCells; gx++) {
      const cellIndex = gy * sizeCells + gx;
      const nx = gx * metalScale;
      const ny = gy * metalScale;
      const nz = 0;

      // The shape is NOT decided here. `applyWorkerResult` masks with `asteroidBodyField`, the one shape rule
      // in the codebase, and a second opinion on this side produced holes: a cell this worker skipped but the
      // body field calls solid arrived with integrity 0 and read as already-mined.
      //
      // What is kept is `insideBody`'s own hard early-out — `distance >= 1` is never solid — which is provably
      // identical rather than a second criterion, and still skips the corners and everything past the rim.
      // @see GAME-MINE-007
      const dr = Math.sqrt((gx - halfW) ** 2 + (gy - halfH) ** 2);
      if (dr >= bodyRadiusCells) continue;

      const hardnessValue = hardnessNoise(gx * hardnessScale, gy * hardnessScale, nz);
      let h = Math.max(1, Math.floor((hardnessValue + 1) * 127.5));

      // Radial hardness bias (mirrors main-thread generateData):
      // Center cells are substantially tougher. Matches visual sphere shading
      // and makes digging feel smoother + more strategic (core resists boring straight in).
      const cellDist = Math.hypot(gx - halfW, gy - halfH);
      const normR = maxRLocal > 0 ? Math.min(1, cellDist / maxRLocal) : 0;
      const radialBonus = 1.0 + (1.0 - normR) * 1.65;
      h = Math.min(255, Math.max(1, Math.floor(h * radialBonus)));

      hardnessFlat[cellIndex] = h;
      integrityFlat[cellIndex] = h;

      // Base metal values (each in [0,1] from noise)
      const baseMetalVals = metalNoises.map(fn =>
        Math.max(0, fn(nx, ny, nz) + 1) / 2
      );

      let metalVals = baseMetalVals.slice();

      // Distance bias (richer metals further from hub)
      if (distanceBias > 0) {
        const bias = distanceBias;
        metalVals = metalVals.map(v => v * (1 + bias * 0.5));
        const premBias = bias * premiumMetalBias;
        const halfM = Math.floor(metals.length / 2);
        for (let i = halfM; i < metals.length; i++) {
          metalVals[i] *= 1 + premBias;
        }
      }

      // Faction relation bias
      if (factionRelation !== undefined) {
        const boost = factionRelation > 0 ? 1.3 : factionRelation < 0 ? 0.7 : 1.0;
        metalVals = metalVals.map(v => v * boost);
      }

      // Store argmax metal index and normalised dominance margin for each solid cell.
      let best = 0;
      for (let m = 1; m < metalCount; m++) {
        if (metalVals[m] > metalVals[best]) best = m;
      }
      const total = metalVals.reduce((s, v) => s + v, 0);
      metalIndexFlat[cellIndex] = total > 0 ? best : 0;
    }
  }

  return { integrityFlat, hardnessFlat, metalIndexFlat };
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------
self.onmessage = evt => {
  const { type, id, params } = evt.data;
  if (type !== 'generate') return;

  const { integrityFlat, hardnessFlat, metalIndexFlat } = generateAsteroidData(params);

  self.postMessage(
    {
      type: 'result',
      id,
      integrityFlat:      integrityFlat.buffer,
      hardnessFlat:       hardnessFlat.buffer,
      metalIndexFlat:     metalIndexFlat.buffer,
    },
    [integrityFlat.buffer, hardnessFlat.buffer, metalIndexFlat.buffer]
  );
};
