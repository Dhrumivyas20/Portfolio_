(function() {
    // Basic setup
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x080c10, 0.0035);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 1, 1500);
    camera.position.set(0, 100, 250);

    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x080c10, 1);

    // Accent colors from CSS
    const colorAccent = new THREE.Color('#38bdf8'); // Primary accent
    
    // Create an invisible plane for raycasting (mouse tracking)
    const planeGeometry = new THREE.PlaneGeometry(3000, 3000);
    planeGeometry.rotateX(-Math.PI / 2); // Flat on XZ plane
    const planeMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const intersectPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    scene.add(intersectPlane);

    // Create Particle Grid
    const countX = 90;
    const countZ = 90;
    const spacing = 18;
    
    const numParticles = countX * countZ;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(numParticles * 3);
    const scales = new Float32Array(numParticles);

    let i = 0;
    let j = 0;

    for (let ix = 0; ix < countX; ix++) {
        for (let iz = 0; iz < countZ; iz++) {
            positions[i] = ix * spacing - ((countX * spacing) / 2); // x
            positions[i + 1] = 0; // y
            positions[i + 2] = iz * spacing - ((countZ * spacing) / 2); // z
            scales[j] = 1;
            i += 3;
            j++;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));

    // Custom shader material for smooth fading circles
    const material = new THREE.ShaderMaterial({
        uniforms: {
            color: { value: colorAccent }
        },
        vertexShader: `
            attribute float scale;
            void main() {
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = scale * (225.0 / -mvPosition.z) * 1.25; // Middle ground size
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 color;
            void main() {
                // Create soft edge circles
                vec2 circCoord = 2.0 * gl_PointCoord - 1.0;
                float dist = dot(circCoord, circCoord);
                if (dist > 1.0) discard;
                
                // Add soft alpha falloff - middle ground opacity
                float alpha = (1.0 - dist) * 0.45; 
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    // Interactivity
    const raycaster = new THREE.Raycaster();
    const mouseCoords = new THREE.Vector2(9999, 9999);
    let intersectPoint = new THREE.Vector3(9999, 9999, 9999);

    let mouseX = 0;
    let mouseY = 0;
    let windowHalfX = window.innerWidth / 2;
    let windowHalfY = window.innerHeight / 2;

    document.addEventListener('mousemove', (event) => {
        // For camera parallax
        mouseX = event.clientX - windowHalfX;
        mouseY = event.clientY - windowHalfY;

        // For raycasting
        mouseCoords.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouseCoords.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });

    window.addEventListener('resize', () => {
        windowHalfX = window.innerWidth / 2;
        windowHalfY = window.innerHeight / 2;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Animation Loop
    let count = 0;

    function animate() {
        requestAnimationFrame(animate);

        // Smooth camera movement (parallax)
        camera.position.x += (mouseX * 0.15 - camera.position.x) * 0.05;
        camera.position.y += (-mouseY * 0.15 + 120 - camera.position.y) * 0.05;
        camera.lookAt(0, -20, 0);

        // Raycasting
        raycaster.setFromCamera(mouseCoords, camera);
        const intersects = raycaster.intersectObject(intersectPlane);
        if (intersects.length > 0) {
            intersectPoint.copy(intersects[0].point);
        } else {
            // Move intersect point far away if we are not hovering
            intersectPoint.set(9999, 9999, 9999);
        }

        const posArray = particles.geometry.attributes.position.array;
        const scaleArray = particles.geometry.attributes.scale.array;

        let index = 0;
        let scaleIndex = 0;
        
        const impactRadius = 120; // How wide the mouse hover effect is
        const impactAmount = 45; // How much particles are pushed up

        for (let ix = 0; ix < countX; ix++) {
            for (let iz = 0; iz < countZ; iz++) {
                const px = posArray[index];
                const pz = posArray[index + 2];
                
                // Base wave height
                let py = (Math.sin((ix + count) * 0.25) * 18) +
                         (Math.sin((iz + count) * 0.3) * 18) + 
                         (Math.sin((ix + iz + count) * 0.2) * 10);
                
                let s = (Math.sin((ix + count) * 0.25) + 1.5) * 1.5 +
                        (Math.sin((iz + count) * 0.3) + 1.5) * 1.5;

                // Mouse interaction displacement
                const dx = px - intersectPoint.x;
                const dz = pz - intersectPoint.z;
                const dist = Math.sqrt(dx * dx + dz * dz);

                if (dist < impactRadius) {
                    // Smoothly bulge upwards based on distance to cursor
                    const influence = 1 - (dist / impactRadius);
                    // Easing curve for a smoother bump (sine wave easing)
                    const bump = Math.sin(influence * Math.PI / 2);
                    
                    py += bump * impactAmount;
                    s += bump * 3.0; // Make particles larger when hovering
                }

                posArray[index + 1] = py;
                scaleArray[scaleIndex] = s;

                index += 3;
                scaleIndex++;
            }
        }

        particles.geometry.attributes.position.needsUpdate = true;
        particles.geometry.attributes.scale.needsUpdate = true;

        count += 0.04; // Speed of the wave

        renderer.render(scene, camera);
    }

    animate();
})();
