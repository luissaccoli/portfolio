const background = document.querySelector('.hero-animated-bg');

if (background) {
  background.classList.add('no-webgl');

  const canvas = document.createElement('canvas');
  canvas.className = 'hero-contour-canvas';
  background.appendChild(canvas);

  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: true,
    premultipliedAlpha: false,
  });

  if (gl) {
    const vertexSource = `
      attribute vec2 a_position;
      varying vec2 v_uv;

      void main() {
        v_uv = a_position * 0.5 + 0.5;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const fragmentSource = `
      precision highp float;

      varying vec2 v_uv;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec2 u_mouse;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);

        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
          u.y
        );
      }

      float fbm(vec2 p) {
        float value = 0.0;
        float amplitude = 0.55;

        for (int i = 0; i < 5; i++) {
          value += amplitude * noise(p);
          p = mat2(1.62, 1.18, -1.18, 1.62) * p;
          amplitude *= 0.52;
        }

        return value;
      }

      void main() {
        vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
        vec2 p = (v_uv - 0.5) * aspect * 0.5;
        vec2 mouse = (u_mouse - 0.5) * aspect;
        float mousePull = 0.018 / (length(p - mouse) + 0.45);

        vec2 flow = vec2(
          fbm(p * 1.15 + vec2(u_time * 0.010, -u_time * 0.007)),
          fbm(p * 1.15 + vec2(-u_time * 0.008, u_time * 0.011) + 9.2)
        );

        float field = fbm(p * 0.85 + flow * 1.8 + mousePull);
        field += 0.10 * sin((p.x * 1.2 + p.y * 0.7) - u_time * 0.12);

        float contour = abs(fract(field * 27.0) - 0.5);
        float thinLine = 1.0 - smoothstep(0.010, 0.024, contour);
        float glowLine = 1.0 - smoothstep(0.024, 0.090, contour);
        float vignette = smoothstep(0.98, 0.22, length(p));
        float intensity = (thinLine * 0.95 + glowLine * 0.24) * vignette;

        gl_FragColor = vec4(vec3(intensity), 1.0);
      }
    `;

    const createShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);

      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }

      return shader;
    };

    const vertexShader = createShader(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();

    if (vertexShader && fragmentShader) {
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
    }

    if (vertexShader && fragmentShader && gl.getProgramParameter(program, gl.LINK_STATUS)) {
      background.classList.remove('no-webgl');

      const positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );

      const positionLocation = gl.getAttribLocation(program, 'a_position');
      const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
      const timeLocation = gl.getUniformLocation(program, 'u_time');
      const mouseLocation = gl.getUniformLocation(program, 'u_mouse');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const mouse = { x: 0.5, y: 0.5 };
      let visible = true;

      window.addEventListener('pointermove', (event) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = (event.clientX - rect.left) / rect.width;
        mouse.y = 1 - (event.clientY - rect.top) / rect.height;
      }, { passive: true });

      const observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      observer.observe(background);

      const resizeCanvas = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        gl.viewport(0, 0, canvas.width, canvas.height);
      };

      const render = (time) => {
        if (visible) {
          resizeCanvas();
          gl.useProgram(program);
          gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
          gl.enableVertexAttribArray(positionLocation);
          gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
          gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
          gl.uniform1f(timeLocation, reducedMotion ? 0 : time * 0.001);
          gl.uniform2f(mouseLocation, mouse.x, mouse.y);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }

        requestAnimationFrame(render);
      };

      requestAnimationFrame(render);
    }
  }
}
