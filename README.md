# TuneCamp Audiofabric

An interactive 3D WebGL music visualizer built with `regl` and the Web Audio API. Renders beautiful real-time, audio-reactive 3D terrain and dynamic waveforms. Part of the TuneCamp ecosystem.

![audiofabric](/images/audiofabric.png?raw=true "audiofabric")
![audiofabric-2](/images/audiofabric-2.png?raw=true "audiofabric-2")

## Features

- **Real-Time Audio Analysis**: Uses the Web Audio API to process live audio frequency and time-domain data.
- **High-Performance WebGL**: Powered by `regl` for GPU-accelerated 3D terrain generation and rendering.
- **Dynamic Controls**: Includes interactive parameters via `dat-gui` to customize rendering, speeds, noise generation, and shaders.
- **Responsive Layout**: Adapts seamlessly to the browser viewport using `canvas-fit`.

## Getting Started

### Prerequisites

- Node.js (v16.0.0 or higher recommended)
- `npm` or `yarn`

### Installation

Clone this repository and install the dependencies:

```bash
git clone https://github.com/scobru/tunecamp-audiofabric.git
cd tunecamp-audiofabric
npm install
```

### Development

Start the development server with live-reloading (via `budo`):

```bash
npm start
```

### Production Build

Compile the production JavaScript bundle using Browserify:

```bash
npm run build
```

### Run Locally

To serve the compiled application locally on port 8080:

```bash
npm run serve
```

## Integration with TuneCamp

TuneCamp Audiofabric is fully compatible with TuneCamp streams. You can configure it to analyze audio streams directly from any TuneCamp instance via Subsonic API or direct catalog paths.
