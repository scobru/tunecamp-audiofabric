/* global URLSearchParams, fetch */
const createRegl = require('regl')
const glsl = require('glslify')
const mat4 = require('gl-mat4')
const css = require('dom-css')
const fit = require('canvas-fit')
const { GUI } = require('dat-gui')
const array = require('new-array')
const shuffle = require('shuffle-array')
const Alea = require('alea')
const { createSpring } = require('spring-animator')
const Delaunator = require('delaunator')
const createPlayer = require('web-audio-player')
const createAnalyser = require('web-audio-analyser')
const createCamera = require('./camera')
const createTitleCard = require('./title-card')
const createAudioControls = require('./audio-controls')
const createRenderBloom = require('./render-bloom')
const createRenderBlur = require('./render-blur')
const createRenderGrid = require('./render-grid')

// ─── TuneCamp Lab integration ─────────────────────────────────────────────────
// Supports these sources (in priority order):
//  1.  URL params: ?tc=https://my-tunecamp.com&u=user&p=pass
//  1b. Same-origin localStorage JWT (opened from TuneCamp Lab)
//  1c. Saved cross-origin credentials in localStorage (standalone mode)
//  2.  TuneCamp Lab SDK PostMessage bridge (inside iframe)
//  3.  Interactive connect form (standalone, no credentials found)
//  4.  Built-in royalty-free demo tracks (SoundHelix)

var DEMO_TRACKS = [
  { title: 'SoundHelix Song 1', artist: 'SoundHelix', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3' },
  { title: 'SoundHelix Song 2', artist: 'SoundHelix', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3' },
  { title: 'SoundHelix Song 3', artist: 'SoundHelix', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3' },
  { title: 'SoundHelix Song 4', artist: 'SoundHelix', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  { title: 'SoundHelix Song 5', artist: 'SoundHelix', path: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3' }
]

var LS_SERVER = 'audiofabric_server'
var LS_USER = 'audiofabric_user'
var LS_PASS = 'audiofabric_pass'

function subsonicTracks (base, user, pass) {
  var cleanBase = base.replace(/\/$/, '')
  var auth = 'u=' + encodeURIComponent(user) +
    '&p=' + encodeURIComponent(pass) +
    '&v=1.16.1&c=audiofabric&f=json'
  return fetch(cleanBase + '/rest/getRandomSongs.view?' + auth + '&size=20')
    .then(function (r) { return r.json() })
    .then(function (data) {
      var sub = data['subsonic-response']
      if (sub && sub.status === 'ok' && sub.randomSongs && sub.randomSongs.song) {
        return sub.randomSongs.song.map(function (s) {
          return {
            title: s.title || 'Unknown',
            artist: s.artist || 'Unknown',
            path: cleanBase + '/rest/stream.view?' + auth + '&id=' + s.id
          }
        })
      }
      return null
    })
}

function showConnectForm (done, defaultServer, defaultUser) {
  var overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
    'background:rgba(25,25,25,0.97)', 'display:flex', 'align-items:center',
    'justify-content:center', 'z-index:200', 'font-family:inherit'
  ].join(';')

  var inputStyle = [
    'display:block', 'width:100%', 'box-sizing:border-box',
    'background:rgba(40,40,40,0.8)', 'border:1px solid rgb(80,80,80)',
    'color:#eee', 'padding:10px 14px', 'font-size:13px', 'letter-spacing:1px',
    'font-family:inherit', 'outline:none', 'margin-bottom:10px'
  ].join(';')

  var btnStyle = [
    'display:block', 'width:100%', 'padding:12px', 'margin-top:6px',
    'cursor:pointer', 'font-size:13px', 'letter-spacing:2px', 'font-family:inherit',
    'outline:none', 'border:1px solid rgb(80,80,80)'
  ].join(';')

  overlay.innerHTML = '<div style="width:340px;padding:40px 36px;background:rgba(45,45,45,0.98);border:1px solid rgb(70,70,70)">' +
    '<div style="font-size:18px;font-weight:200;letter-spacing:6px;color:#eee;margin-bottom:6px">AUDIOFABRIC</div>' +
    '<div style="font-size:11px;letter-spacing:2px;color:#888;margin-bottom:28px;text-transform:uppercase">Connect to TuneCamp</div>' +
    '<input id="af-server" style="' + inputStyle + '" placeholder="https://your-tunecamp.com" value="' + (defaultServer || '') + '" />' +
    '<input id="af-user" style="' + inputStyle + '" placeholder="Username" value="' + (defaultUser || '') + '" />' +
    '<input id="af-pass" type="password" style="' + inputStyle + '" placeholder="Password or API token" />' +
    '<div id="af-error" style="color:#f66;font-size:12px;margin-bottom:8px;display:none"></div>' +
    '<button id="af-connect" style="' + btnStyle + 'background:rgba(60,60,60,0.95);color:#eee">CONNECT</button>' +
    '<button id="af-demo" style="' + btnStyle + 'background:transparent;color:#666;margin-top:10px;border-color:transparent">use demo tracks</button>' +
    '</div>'

  document.body.appendChild(overlay)

  function setError (msg) {
    var el = document.getElementById('af-error')
    el.textContent = msg
    el.style.display = msg ? 'block' : 'none'
  }

  document.getElementById('af-connect').addEventListener('click', function () {
    var server = document.getElementById('af-server').value.trim()
    var user = document.getElementById('af-user').value.trim()
    var pass = document.getElementById('af-pass').value.trim()
    if (!server || !user || !pass) { setError('All fields required.'); return }
    setError('')
    document.getElementById('af-connect').textContent = 'CONNECTING...'
    subsonicTracks(server, user, pass)
      .then(function (tracks) {
        if (!tracks) { setError('Wrong credentials or server unreachable.'); document.getElementById('af-connect').textContent = 'CONNECT'; return }
        try { localStorage.setItem(LS_SERVER, server); localStorage.setItem(LS_USER, user); localStorage.setItem(LS_PASS, pass) } catch (e) {}
        document.body.removeChild(overlay)
        done(tracks)
      })
      .catch(function () { setError('Could not reach server. Check URL and CORS.'); document.getElementById('af-connect').textContent = 'CONNECT' })
  })

  document.getElementById('af-demo').addEventListener('click', function () {
    document.body.removeChild(overlay)
    done(DEMO_TRACKS)
  })
}

// Resolve tracks from TuneCamp, calling `done(tracks)` when ready.
function loadTracks (done) {
  // 1 — Subsonic via URL query params: ?tc=SERVER&u=USER&p=PASS
  var params = new URLSearchParams(window.location.search)
  var tcServer = params.get('tc')
  var tcUser = params.get('u')
  var tcPass = params.get('p')

  if (tcServer && tcUser && tcPass) {
    subsonicTracks(tcServer, tcUser, tcPass)
      .then(function (tracks) { done(tracks || DEMO_TRACKS) })
      .catch(function () { done(DEMO_TRACKS) })
    return
  }

  // 1b — Same-origin TuneCamp auto-detection via localStorage JWT
  var localToken = null
  try { localToken = window.localStorage.getItem('tunecamp_token') } catch (e) {}
  if (localToken) {
    subsonicTracks(window.location.origin, '_', localToken)
      .then(function (tracks) { done(tracks || DEMO_TRACKS) })
      .catch(function () { done(DEMO_TRACKS) })
    return
  }

  // 1c — Saved cross-origin credentials (standalone mode, previously connected)
  var savedServer, savedUser, savedPass
  try { savedServer = localStorage.getItem(LS_SERVER); savedUser = localStorage.getItem(LS_USER); savedPass = localStorage.getItem(LS_PASS) } catch (e) {}
  if (savedServer && savedUser && savedPass) {
    subsonicTracks(savedServer, savedUser, savedPass)
      .then(function (tracks) {
        if (tracks) { done(tracks); return }
        // Saved creds no longer valid — clear and show form
        try { localStorage.removeItem(LS_SERVER); localStorage.removeItem(LS_USER); localStorage.removeItem(LS_PASS) } catch (e) {}
        showConnectForm(done, savedServer, savedUser)
      })
      .catch(function () { showConnectForm(done, savedServer, savedUser) })
    return
  }

  // 2 — TuneCamp Lab SDK PostMessage bridge (inside iframe)
  var isStandalone = window.parent === window
  var fallbackTimer = setTimeout(function () {
    window.removeEventListener('message', onMessage)
    if (isStandalone) {
      showConnectForm(done, '', '')
    } else {
      done(DEMO_TRACKS)
    }
  }, 2000)

  function onMessage (event) {
    if (!event.data || event.data.type !== 'tunecamp:response') return
    var payload = event.data.payload
    if (!payload || !payload.tracks || !payload.tracks.length) return
    clearTimeout(fallbackTimer)
    window.removeEventListener('message', onMessage)
    done(payload.tracks.map(function (t) {
      return {
        title: t.title || 'Unknown',
        artist: t.artist || 'Unknown',
        path: t.streamUrl || t.url || t.path || ''
      }
    }))
  }

  window.addEventListener('message', onMessage)

  try {
    window.parent.postMessage(
      { type: 'tunecamp:request', action: 'getLibrary', payload: { limit: 20 } },
      '*'
    )
  } catch (e) {
    clearTimeout(fallbackTimer)
    window.removeEventListener('message', onMessage)
    showConnectForm(done, '', '')
  }
}

// ─── App setup (deferred until tracks are resolved) ───────────────────────────

const titleCard = createTitleCard()
const canvas = document.querySelector('canvas.viz')
const resize = fit(canvas)
const camera = createCamera(canvas, [2.5, 2.5, 2.5], [0, 0, 0])
const regl = createRegl(canvas)

let analyser, delaunay, points, positions, positionsBuffer, renderFrequencies,
  renderGrid, blurredFbo, renderToBlurredFBO

const getFrameBuffer = (width, height) => (
  regl.framebuffer({
    color: regl.texture({ shape: [width, height, 4] }),
    depth: false,
    stencil: false
  })
)

const fbo = getFrameBuffer(512, 512)
const freqMapFBO = getFrameBuffer(512, 512)
const renderToFBO = regl({ framebuffer: fbo })
const renderToFreqMapFBO = regl({ framebuffer: freqMapFBO })
const renderBloom = createRenderBloom(regl, canvas)
const renderBlur = createRenderBlur(regl)

const settings = {
  seed: 0,
  points: 2500,
  dampening: 0.7,
  stiffness: 0.55,
  freqPow: 1.7,
  connectedNeighbors: 4,
  neighborWeight: 0.99,
  connectedBinsStride: 1,
  blurAngle: 0.25,
  blurMag: 7,
  blurRadius: 3,
  blurWeight: 0.8,
  originalWeight: 1.2,
  gridLines: 180,
  linesDampening: 0.02,
  linesStiffness: 0.9,
  linesAnimationOffset: 12,
  gridMaxHeight: 0.28,
  motionBlur: true,
  motionBlurAmount: 0.45
}

const gui = new GUI()
gui.closed = true
css(gui.domElement.parentElement, { zIndex: 11, opacity: 0 })
const fabricGUI = gui.addFolder('fabric')
fabricGUI.add(settings, 'dampening', 0.01, 1).step(0.01).onChange(setup)
fabricGUI.add(settings, 'stiffness', 0.01, 1).step(0.01).onChange(setup)
fabricGUI.add(settings, 'connectedNeighbors', 0, 7).step(1).onChange(setup)
fabricGUI.add(settings, 'neighborWeight', 0.8, 1).step(0.01)
const bloomGUI = gui.addFolder('bloom')
bloomGUI.add(settings, 'blurRadius', 0, 20).step(1)
bloomGUI.add(settings, 'blurWeight', 0, 2).step(0.01)
bloomGUI.add(settings, 'originalWeight', 0, 2).step(0.01)
const gridGUI = gui.addFolder('grid')
gridGUI.add(settings, 'gridLines', 10, 300).step(1).onChange(setup)
gridGUI.add(settings, 'linesAnimationOffset', 0, 100).step(1)
gridGUI.add(settings, 'gridMaxHeight', 0.01, 0.8).step(0.01)

let hasSetUp = false

// Resize handler — needs setup() reference, registered after init
window.addEventListener('resize', () => {
  resize()
  if (hasSetUp) setup()
  titleCard.resize()
}, false)

// ─── Boot: resolve tracks then start audio + visualisation ────────────────────
loadTracks(function (tracks) {
  const audio = createPlayer(tracks[0].path, { crossOrigin: 'anonymous' })
  audio.on('load', function () {
    window.audio = audio
    analyser = createAnalyser(audio.node, audio.context, { audible: true, stereo: false })
    const audioControls = createAudioControls(audio.element, tracks)

    function loop () {
      window.requestAnimationFrame(loop)
      audioControls.tick()
    }

    analyser.analyser.fftSize = 1024 * 2
    analyser.analyser.minDecibels = -75
    analyser.analyser.maxDecibels = -30
    analyser.analyser.smoothingTimeConstant = 0.5

    setup()

    const renderLoop = startLoop()
    setTimeout(renderLoop.cancel.bind(renderLoop), 1000)

    titleCard.show()
      .then(() => new Promise(resolve => setTimeout(resolve, 1000)))
      .then(() => {
        css(audioControls.el, { transition: 'opacity 1s linear', opacity: 1 })
        css(gui.domElement.parentElement, { transition: 'opacity 1s linear', opacity: 1 })
        window.requestAnimationFrame(loop)
        audio.play()
        camera.start()
        startLoop()
      })
  })
})

// ─── Visualisation logic (unchanged) ─────────────────────────────────────────

function setup () {
  hasSetUp = true
  const rand = new Alea(settings.seed)
  points = []

  blurredFbo = getFrameBuffer(canvas.width, canvas.height)
  renderToBlurredFBO = regl({ framebuffer: blurredFbo })
  renderGrid = createRenderGrid(regl, settings)

  const frequenciesCount = analyser.frequencies().length
  for (let q = 0; q < frequenciesCount; q += settings.connectedBinsStride) {
    const mag = Math.pow(rand(), 1 - q / frequenciesCount) * 0.9
    const rads = rand() * Math.PI * 2
    const position = [Math.cos(rads) * mag, Math.sin(rads) * mag]
    const id = points.length
    const point = createPoint(id, position)
    point.frequencyBin = q
    points.push(point)
  }

  array(Math.max(0, settings.points - points.length)).forEach((_, i) => {
    const id = points.length
    points.push(createPoint(id, [rand() * 2 - 1, rand() * 2 - 1]))
  })

  function createPoint (id, position) {
    return {
      position: position,
      id: id,
      neighbors: new Set(),
      spring: createSpring(settings.dampening * settings.stiffness, settings.stiffness, 0)
    }
  }

  delaunay = new Delaunator(points.map((pt) => pt.position))
  for (let j = 0; j < delaunay.triangles.length; j += 3) {
    const pt1 = delaunay.triangles[j]
    const pt2 = delaunay.triangles[j + 1]
    const pt3 = delaunay.triangles[j + 2]
    points[pt1].neighbors.add(pt2)
    points[pt1].neighbors.add(pt3)
    points[pt2].neighbors.add(pt1)
    points[pt2].neighbors.add(pt3)
    points[pt3].neighbors.add(pt1)
    points[pt3].neighbors.add(pt2)
  }

  points.forEach(pt => {
    pt.neighbors = shuffle(Array.from(pt.neighbors)).slice(0, settings.connectedNeighbors)
  })

  positions = new Float32Array(delaunay.triangles.length * 3)
  positionsBuffer = regl.buffer(positions)

  renderFrequencies = regl({
    vert: glsl`
      attribute vec3 position;
      varying vec4 fragColor;
      void main() {
        float actualIntensity = position.z * 1.2;
        fragColor = vec4(vec3(actualIntensity), 1);
        gl_Position = vec4(position.xy, 0, 1);
      }
    `,
    frag: glsl`
      precision highp float;
      varying vec4 fragColor;
      void main() {
        gl_FragColor = fragColor;
      }
    `,
    attributes: { position: positionsBuffer },
    count: delaunay.triangles.length,
    primitive: 'triangles'
  })
}

function update () {
  const frequencies = analyser.frequencies()
  points.forEach(pt => {
    let value = 0
    if (pt.frequencyBin || pt.frequencyBin === 0) {
      value = Math.pow(frequencies[pt.frequencyBin] / 255, settings.freqPow)
    }
    const neighbors = pt.neighbors
    const neighborSum = neighbors.reduce((total, ptID) => {
      return total + points[ptID].spring.tick(1, false)
    }, 0)
    const neighborAverage = neighbors.length ? neighborSum / neighbors.length : 0
    value = Math.max(value, neighborAverage * settings.neighborWeight)
    pt.spring.updateValue(value)
    pt.spring.tick()
  })

  for (let j = 0; j < delaunay.triangles.length; j++) {
    const ptIndex = delaunay.triangles[j]
    const point = points[ptIndex]
    positions[j * 3] = point.position[0]
    positions[j * 3 + 1] = point.position[1]
    positions[j * 3 + 2] = point.spring.tick(1, false)
  }
  positionsBuffer(positions)
}

const renderGlobals = regl({
  uniforms: {
    projection: ({viewportWidth, viewportHeight}) => mat4.perspective(
      [], Math.PI / 4, viewportWidth / viewportHeight, 0.01, 1000
    ),
    view: () => camera.getMatrix(),
    time: ({ time }) => time
  }
})

const renderColoredQuad = regl({
  vert: glsl`
    precision highp float;
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0, 1); }
  `,
  frag: glsl`
    precision highp float;
    uniform vec4 color;
    void main () { gl_FragColor = color; }
  `,
  blend: {
    enable: true,
    func: { srcRGB: 'src alpha', srcAlpha: 1, dstRGB: 'one minus src alpha', dstAlpha: 1 },
    equation: { rgb: 'add', alpha: 'add' }
  },
  uniforms: { color: regl.prop('color') },
  attributes: { position: [-1, -1, -1, 4, 4, -1] },
  count: 3,
  primitive: 'triangles'
})

function startLoop () {
  return regl.frame(({ time }) => {
    camera.tick({ time })
    update()
    renderToFBO(() => { renderFrequencies() })
    renderToFreqMapFBO(() => {
      const rads = settings.blurAngle * Math.PI
      renderBlur({
        iChannel0: fbo,
        direction: [Math.cos(rads) * settings.blurMag, Math.sin(rads) * settings.blurMag]
      })
    })
    renderToBlurredFBO(() => {
      if (settings.motionBlur) {
        renderColoredQuad({ color: [0.18, 0.18, 0.18, settings.motionBlurAmount] })
      } else {
        regl.clear({ color: [0.18, 0.18, 0.18, 1], depth: 1 })
      }
      renderGlobals(() => {
        renderGrid({ frequencyVals: freqMapFBO, gridMaxHeight: settings.gridMaxHeight, multiplier: 1 })
      })
    })
    renderBloom({
      iChannel0: blurredFbo,
      blurMag: settings.blurRadius,
      blurWeight: settings.blurWeight,
      originalWeight: settings.originalWeight
    })
  })
}
