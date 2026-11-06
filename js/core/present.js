// Puts the finished low-resolution frame on the screen as square pixels.
//
// A 2D canvas can only ask for this: imageSmoothingEnabled = false is a request, and a runtime is free to
// filter anyway. Desktop Chromium honours it, which is why the game looks sharp in WeChat DevTools. A
// WebGL texture with NEAREST filtering is a rule the GPU follows on every device, so it is the first
// choice.
//
// The self-test runs on the on-screen canvas itself. A rehearsal on a spare canvas looks safer, but WebGL on
// WeChat's off-screen canvases is reported to be next to useless, so it could turn this off on a phone where
// it would have worked. The cost is that a canvas keeps the first kind of context it is given, so there is
// no 2D to go back to once WebGL is taken. A failed self-test tries a second way of uploading instead.
//
// The frame's pixels are copied into the texture every frame, and the frame's canvas is not handed to WebGL.
// A build that preferred handing it over stayed on its first frame on a real phone, and a self-test that uploads
// once can't see that kind of failure. Copying costs a little more, and it reads what the canvas holds right now.

const OPTIONS = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false };

const VERT = 'attribute vec2 p;attribute vec2 t;varying highp vec2 v;void main(){v=t;gl_Position=vec4(p,0.,1.);}';
// A tall phone needs high precision: mediump can land a coordinate on the neighbouring texel. The fragment
// side leaves it to the default below, because a shader that insists on highp fails to compile without it.
const FRAG = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n'
  + 'uniform sampler2D s;varying vec2 v;void main(){gl_FragColor=texture2D(s,v);}';

// Two ways to get a frame into the texture. Copying the pixels out reads the canvas as it is now, with rows in
// a defined order, so nothing about the upload depends on the runtime's handling of canvases. Handing over the
// canvas is the fallback for a phone where copying fails.
const fromPixels = (gl, source) => {
  const { data } = source.getContext('2d').getImageData(0, 0, source.width, source.height);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, source.width, source.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
};
const fromCanvas = (gl, source) => gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

// Sets up one textured quad and returns the function that shows a canvas on it. u1 and v1 say how much of
// the frame is used: the buffer can be slightly wider than the screen, and cropping keeps each block whole.
function build(gl, width, height, u1, v1, upload) {
  const shader = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  // Texture rows arrive top first, so v = 0 is the top of the picture. No Y flip is requested, because
  // that flag is one more thing a runtime could get wrong.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 1, 0, 0, -1, -1, 0, v1, 1, 1, u1, 0, 1, -1, u1, v1]), gl.STATIC_DRAW);
  const ap = gl.getAttribLocation(prog, 'p'), at = gl.getAttribLocation(prog, 't');
  gl.enableVertexAttribArray(ap);
  gl.enableVertexAttribArray(at);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 16, 0);
  gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 16, 8);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(gl.getUniformLocation(prog, 's'), 0);
  gl.disable(gl.BLEND);
  gl.disable(gl.DITHER);
  gl.viewport(0, 0, width, height);

  return (source) => {
    upload(gl, source);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };
}

const PROBE = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255], [32, 32, 32], [192, 128, 64]];
const PROBE_W = 3, PROBE_H = 2, PROBE_K = 2;

// Draws a small known pattern into a corner of the screen by the given route and reads it back, exact to the
// pixel. It happens before anything is shown, and the corner is cleared afterwards. The pattern is drawn twice
// on one canvas, in a different order, because the game re-uploads one canvas every frame and a first upload
// proves nothing about the next.
function drawsExactly(gl, make, upload) {
  let src = null;
  try {
    for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++); // Errors left by an earlier attempt.
    src = make();
    src.width = PROBE_W;
    src.height = PROBE_H;
    const c = src.getContext('2d');
    const w = PROBE_W * PROBE_K, h = PROBE_H * PROBE_K;
    const show = build(gl, w, h, 1, 1, upload);
    const px = new Uint8Array(w * h * 4);
    for (const pattern of [PROBE, PROBE.slice().reverse()]) {
      pattern.forEach((rgb, i) => {
        c.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
        c.fillRect(i % PROBE_W, Math.floor(i / PROBE_W), 1, 1);
      });
      show(src);
      if (gl.getError() !== gl.NO_ERROR) return false;
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const row = h - 1 - y; // readPixels counts rows from the bottom.
          const want = pattern[Math.floor(row / PROBE_K) * PROBE_W + Math.floor(x / PROBE_K)];
          const at = (y * w + x) * 4;
          for (let k = 0; k < 3; k++) if (Math.abs(px[at + k] - want[k]) > 2) return false;
        }
      }
    }
    return true;
  } catch (e) {
    return false;
  } finally {
    if (src) {
      src.width = 1;
      src.height = 1;
    }
  }
}

// Asks the 2D canvas for square pixels and checks whether it listened. Only used to report what a device
// does, so a phone that looks wrong can be told apart from one that merely looks different.
function smoothingIgnored(make) {
  let src = null, dst = null;
  try {
    src = make();
    src.width = 2;
    src.height = 1;
    const a = src.getContext('2d');
    a.fillStyle = '#000000';
    a.fillRect(0, 0, 1, 1);
    a.fillStyle = '#ffffff';
    a.fillRect(1, 0, 1, 1);
    dst = make();
    dst.width = 16;
    dst.height = 1;
    const b = dst.getContext('2d');
    b.imageSmoothingEnabled = false;
    b.drawImage(src, 0, 0, 16, 1);
    const d = b.getImageData(0, 0, 16, 1).data;
    for (let i = 0; i < 16; i++) if (d[i * 4] > 8 && d[i * 4] < 247) return true;
    return false;
  } catch (e) {
    return null;
  } finally {
    [src, dst].forEach((c) => {
      if (!c) return;
      c.width = 1;
      c.height = 1;
    });
  }
}

function webglScreen(gl, back, physW, physH, W, H, scale, upload) {
  const make = () => build(gl, gl.drawingBufferWidth, gl.drawingBufferHeight, physW / scale / W, physH / scale / H, upload);
  let draw = make();
  let lost = false;
  return () => {
    // A lost context takes everything with it, so it is rebuilt from scratch when it comes back.
    if (gl.isContextLost && gl.isContextLost()) {
      lost = true;
      return;
    }
    if (lost) {
      lost = false;
      draw = make();
    }
    draw(back);
  };
}

function canvasScreen(ctx, back, W, H, scale) {
  return () => {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(back, 0, 0, W * scale, H * scale);
  };
}

function create(main, back, make, fit) {
  const { physW, physH, W, H, scale } = fit;
  const smoothing = smoothingIgnored(make);
  const plain = (why) => ({ mode: '2d', why, smoothing, draw: canvasScreen(main.getContext('2d'), back, W, H, scale), bufW: physW, bufH: physH });
  let gl = null;
  try {
    gl = main.getContext('webgl', OPTIONS);
  } catch (e) {
    gl = null;
  }
  if (!gl) return plain('no-webgl');
  // If neither route passes, the read-back may be what is failing, so copying stays and the settings screen
  // says it could not be verified.
  let upload = fromPixels, why = '';
  if (!drawsExactly(gl, make, fromPixels)) {
    if (drawsExactly(gl, make, fromCanvas)) {
      upload = fromCanvas;
      why = 'canvas';
    } else why = 'unverified';
  }
  try {
    const draw = webglScreen(gl, back, physW, physH, W, H, scale, upload);
    gl.clearColor(11 / 255, 10 / 255, 20 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { mode: 'webgl', why, smoothing, draw, bufW: gl.drawingBufferWidth, bufH: gl.drawingBufferHeight };
  } catch (e) {
    return plain('setup-failed'); // Browsers refuse this, and then nothing can be shown. Some runtimes may allow it.
  }
}

module.exports = { create };
