import * as THREE from 'three'; // Import the main Three.js library
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'; // Import GLTF loader for loading 3D models
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'; // Import controls for camera manipulation

export default class ProductViewer {
  constructor(container) {
    this.container = container; // HTML element that will contain the 3D canvas
    this.rotationSpeed = 0.005; // Controls how fast the model rotates (currently only used by autoRotate)
    this.isUserInteracting = false; // Track if user is currently interacting
    this.resetTimeout = null; // Timeout for returning to original position
    this.defaultCameraPosition = new THREE.Vector3(); // Store original camera position
    this.defaultTarget = new THREE.Vector3(); // Store original target
    this.clock = new THREE.Clock(); // Clock for tracking time
    this.cursorPosition = { x: 0, y: 0 }; // Track cursor position
    this.resetCountdown = null; // DOM element for countdown
    this.resetDuration = 2000; // Duration in ms before resetting (changing to 2 seconds)
    this.init();
  }

  init() {
    // Create loading indicator
    this.createLoadingIndicator();
    
    // Create cursor countdown
    this.createCursorCountdown();
    
    // Create scene - a container for all 3D objects, lights, and cameras
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x666666); // Slightly brighter background (0x0a0a0a to 0x111111)

    // Create camera - determines what is visible in the scene
    this.camera = new THREE.PerspectiveCamera(
      45, // Field of view in degrees - higher values show more of the scene
      this.container.clientWidth / this.container.clientHeight, // Aspect ratio (width/height)
      0.1, // Near clipping plane - objects closer than this won't be rendered
      1000 // Far clipping plane - objects further than this won't be rendered
    );
    this.camera.position.set(0, 0, 5); // Position camera at (x, y, z) coordinates

    // Create renderer - draws the scene on the canvas
    this.renderer = new THREE.WebGLRenderer({ 
      antialias: true, // Smooths edges and improves visual quality
      powerPreference: 'high-performance' // Request high-performance GPU
    });
    this.renderer.setSize(
      this.container.clientWidth, 
      this.container.clientHeight
    ); // Set canvas size to match container
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; // Set color space for better color accuracy
    this.renderer.shadowMap.enabled = true; // Enable shadow rendering
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadow edges
    this.container.appendChild(this.renderer.domElement); // Add the canvas to the container element

    // Add environment map for realistic reflections
    this.addEnvironmentMap();

    // Add lights - illuminate the scene to make objects visible
    
    // Ambient light - general light that illuminates all objects equally
    const ambientLight = new THREE.AmbientLight(
      0x404040, // Light color (increased from 0x303030 to 0x404040)
      0.8 // Intensity (increased from 0.5 to 0.8)
    );
    this.scene.add(ambientLight);

    // Directional light - simulates sunlight, comes from a specific direction
    const directionalLight = new THREE.DirectionalLight(
      0xffffff, // Light color (white)
      1.5 // Intensity (increased from 1.0 to 1.5)
    );
    directionalLight.position.set(1, 1, 1); // Light direction (x, y, z)
    directionalLight.castShadow = true; // Allow this light to cast shadows
    
    // Optimize shadows
    directionalLight.shadow.mapSize.width = 1024; // Shadow map resolution
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.1; // Shadow camera frustum
    directionalLight.shadow.camera.far = 20;
    
    this.scene.add(directionalLight);

    // Rim light - adds definition to object edges
    const rimLight = new THREE.DirectionalLight(
      0xffffff, // Light color (white)
      1.2 // Intensity (increased from 1.0 to 1.2)
    );
    rimLight.position.set(-1, 0.5, -1); // Position from behind and to the side
    this.scene.add(rimLight);

    // Add a new fill light from the front to better illuminate the t-shirt
    const fillLight = new THREE.DirectionalLight(
      0xffffff, // Light color (white)
      1.0 // Medium intensity
    );
    fillLight.position.set(0, 0, 2); // Position in front of the model
    this.scene.add(fillLight);

    // Add orbit controls - allows user to rotate, pan, and zoom the camera
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true; // Add inertia to camera movements
    this.controls.dampingFactor = 0.05; // Amount of inertia (lower = more inertia)
    this.controls.autoRotate = true; // Enable automatic rotation around the target
    this.controls.autoRotateSpeed = 2.0; // Speed of auto-rotation (in degrees per second)
    
    // Set rotation limits (vertical)
    this.controls.minPolarAngle = Math.PI / 4; // Limit how high user can orbit (45 degrees from top)
    this.controls.maxPolarAngle = Math.PI - Math.PI / 4; // Limit how low user can orbit (45 degrees from bottom)
    
    // Limit zoom
    this.controls.minDistance = 0.5; // Can't zoom closer than this
    this.controls.maxDistance = 2; // Can't zoom farther than this
    
    // Track mouse position
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      this.cursorPosition.x = e.clientX - rect.left;
      this.cursorPosition.y = e.clientY - rect.top;
      
      // Update countdown position if visible
      if (this.resetCountdown && this.resetCountdown.style.display === 'block') {
        this.updateCountdownPosition();
      }
    });
    
    // Add event listeners for user interaction
    this.controls.addEventListener('start', () => {
      this.isUserInteracting = true;
      this.controls.autoRotate = false; // Stop auto-rotation during interaction
      
      // Clear any existing timeout
      if (this.resetTimeout) {
        clearTimeout(this.resetTimeout);
        this.resetTimeout = null;
      }
      
      // Hide countdown
      this.hideCountdown();
    });
    
    this.controls.addEventListener('end', () => {
      this.isUserInteracting = false;
      
      // Show and start countdown
      this.showCountdown();
      const startTime = Date.now();
      const updateCountdown = () => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, this.resetDuration - elapsed);
        const progress = 1 - (remaining / this.resetDuration);
        
        if (this.resetCountdown) {
          this.resetCountdown.querySelector('.progress').style.strokeDashoffset = 
            (1 - progress) * (2 * Math.PI * 12); // 12 is the circle radius
        }
        
        if (remaining > 0 && !this.isUserInteracting) {
          requestAnimationFrame(updateCountdown);
        } else if (this.isUserInteracting) {
          this.hideCountdown();
        }
      };
      
      updateCountdown();
      
      // Set a timeout to return to original position/rotation
      this.resetTimeout = setTimeout(() => {
        this.resetToDefaultView();
        this.hideCountdown();
      }, this.resetDuration); // Return to default after 2 seconds of inactivity
    });
    
    // Add double-click handler for repositioning
    this.renderer.domElement.addEventListener('dblclick', () => {
      this.resetToDefaultView();
    });

    // Load the 3D model from the GLB file
    const loader = new GLTFLoader();
    
    // Track loading progress
    const progressBar = document.getElementById('progress-bar');
    
    loader.load(
      '/glb.glb', // Path to the model file
      (gltf) => { // Success callback - called when model is loaded
        this.model = gltf.scene; // Get the main scene from the loaded file
        
        // Enable shadows on all objects and smooth the geometry
        this.model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
            
            // Apply normal smoothing to make the model appear smoother with fewer visible triangles
            if (node.geometry) {
              node.geometry.computeVertexNormals();
            }
            
            // Optimize materials for performance
            if (node.material) {
              // Keep original material properties
              const originalMaterial = node.material;
              
              // Create optimized PBR material
              const newMaterial = new THREE.MeshStandardMaterial({
                map: originalMaterial.map,
                normalMap: originalMaterial.normalMap,
                roughnessMap: originalMaterial.roughnessMap,
                metalnessMap: originalMaterial.metalnessMap,
                emissiveMap: originalMaterial.emissiveMap,
                color: originalMaterial.color,
                metalness: originalMaterial.metalness || 0.5,
                roughness: originalMaterial.roughness || 0.5,
                envMapIntensity: 1.5,
                flatShading: false // Ensure smooth shading is applied
              });
              
              // Apply the new material
              node.material = newMaterial;
            }
          }
        });
        
        // Center the model in the scene
        const box = new THREE.Box3().setFromObject(this.model); // Calculate bounding box
        const center = box.getCenter(new THREE.Vector3()); // Find center point
        this.model.position.sub(center); // Subtract center to position at origin
        
        // Set scale to fit view
        const size = box.getSize(new THREE.Vector3()); // Get model dimensions
        const maxDim = Math.max(size.x, size.y, size.z); // Find largest dimension
        const fov = this.camera.fov * (Math.PI / 180); // Convert FOV to radians
        let cameraZ = Math.abs(maxDim / 2 / Math.tan(fov / 2)); // Calculate ideal distance
        cameraZ *= 1.5; // Zoom out a bit more for margin
        this.camera.position.z = cameraZ; // Set camera distance
        
        // Store the default camera position and target
        this.defaultCameraPosition.copy(this.camera.position);
        this.defaultTarget.copy(this.controls.target);
        
        // Add invisible ground plane for better shadows
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
        groundPlane.rotation.x = -Math.PI / 2;
        groundPlane.position.y = box.min.y;
        groundPlane.receiveShadow = true;
        this.scene.add(groundPlane);
        
        this.scene.add(this.model); // Add the model to the scene
        
        // Hide loading indicator
        this.hideLoadingIndicator();
        
        // Start the render loop
        this.animate();
      }, 
      (xhr) => { // Progress callback - called during loading
        const progress = xhr.loaded / xhr.total;
        if (progressBar) {
          progressBar.style.width = (progress * 100) + '%';
        }
        console.log((progress * 100) + '% loaded'); // Log loading progress
      },
      (error) => { // Error callback - called if loading fails
        console.error('An error happened while loading the model:', error);
        this.hideLoadingIndicator();
        this.showErrorMessage();
      }
    );

    // Handle window resize - update camera and renderer when window size changes
    window.addEventListener('resize', this.onWindowResize.bind(this), false);
    
    // Add touch support - double tap to reset view
    let lastTap = 0;
    this.renderer.domElement.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime();
      const tapLength = currentTime - lastTap;
      if (tapLength < 300 && tapLength > 0) {
        this.resetToDefaultView();
        e.preventDefault();
      }
      lastTap = currentTime;
    });
  }
  
  // Create minimal loading indicator
  createLoadingIndicator() {
    const loadingContainer = document.createElement('div');
    loadingContainer.id = 'loading-container';
    loadingContainer.style.position = 'absolute';
    loadingContainer.style.top = '0';
    loadingContainer.style.left = '0';
    loadingContainer.style.width = '100%';
    loadingContainer.style.height = '100%';
    loadingContainer.style.display = 'flex';
    loadingContainer.style.alignItems = 'center';
    loadingContainer.style.justifyContent = 'center';
    loadingContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
    loadingContainer.style.zIndex = '1000';
    
    // Create a simple loading spinner
    const spinner = document.createElement('div');
    spinner.style.width = '30px';
    spinner.style.height = '30px';
    spinner.style.border = '2px solid rgba(255, 255, 255, 0.3)';
    spinner.style.borderTop = '2px solid rgba(255, 255, 255, 0.8)';
    spinner.style.borderRadius = '50%';
    spinner.style.animation = 'spin 1s linear infinite';
    
    // Add keyframes for spinner animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
    
    loadingContainer.appendChild(spinner);
    this.container.appendChild(loadingContainer);
    this.loadingContainer = loadingContainer;
  }
  
  // Create cursor countdown indicator
  createCursorCountdown() {
    const countdownEl = document.createElement('div');
    countdownEl.className = 'cursor-countdown';
    countdownEl.style.position = 'absolute';
    countdownEl.style.width = '30px';
    countdownEl.style.height = '30px';
    countdownEl.style.pointerEvents = 'none';
    countdownEl.style.display = 'none';
    countdownEl.style.zIndex = '1001';
    
    // SVG for circular progress
    countdownEl.innerHTML = `
      <svg width="30" height="30" viewBox="0 0 30 30">
        <circle cx="15" cy="15" r="12" fill="none" stroke-width="1.5" stroke="rgba(255,255,255,0.2)" />
        <circle class="progress" cx="15" cy="15" r="12" fill="none" stroke-width="1.5" 
                stroke="rgba(255,255,255,0.8)" stroke-dasharray="${2 * Math.PI * 12}" 
                stroke-dashoffset="0" transform="rotate(-90, 15, 15)" />
      </svg>
    `;
    
    this.container.appendChild(countdownEl);
    this.resetCountdown = countdownEl;
  }
  
  // Show countdown near cursor
  showCountdown() {
    if (this.resetCountdown) {
      this.resetCountdown.style.display = 'block';
      this.updateCountdownPosition();
    }
  }
  
  // Hide countdown
  hideCountdown() {
    if (this.resetCountdown) {
      this.resetCountdown.style.display = 'none';
    }
  }
  
  // Update countdown position to follow cursor
  updateCountdownPosition() {
    if (this.resetCountdown) {
      // Fixed offset from cursor for more consistency
      this.resetCountdown.style.left = (this.cursorPosition.x + 20) + 'px';
      this.resetCountdown.style.top = (this.cursorPosition.y - 30) + 'px';
      // Use transform for smoother movement
      this.resetCountdown.style.transform = 'translate3d(0, 0, 0)';
    }
  }
  
  // Hide loading indicator
  hideLoadingIndicator() {
    if (this.loadingContainer) {
      this.loadingContainer.style.opacity = '0';
      this.loadingContainer.style.transition = 'opacity 0.3s';
      setTimeout(() => {
        if (this.loadingContainer && this.loadingContainer.parentNode) {
          this.loadingContainer.parentNode.removeChild(this.loadingContainer);
        }
      }, 300);
    }
  }
  
  // Show error message
  showErrorMessage() {
    const errorContainer = document.createElement('div');
    errorContainer.style.position = 'absolute';
    errorContainer.style.top = '0';
    errorContainer.style.left = '0';
    errorContainer.style.width = '100%';
    errorContainer.style.height = '100%';
    errorContainer.style.display = 'flex';
    errorContainer.style.alignItems = 'center';
    errorContainer.style.justifyContent = 'center';
    errorContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    errorContainer.style.zIndex = '1000';
    
    const errorMessage = document.createElement('div');
    errorMessage.textContent = 'Error loading 3D model. Please try again.';
    errorMessage.style.color = 'white';
    errorMessage.style.padding = '20px';
    errorMessage.style.backgroundColor = '#b00020';
    errorMessage.style.borderRadius = '5px';
    
    errorContainer.appendChild(errorMessage);
    this.container.appendChild(errorContainer);
  }
  
  // Add environment map for realistic reflections
  addEnvironmentMap() {
    // Create a simple gradient environment
    const envScene = new THREE.Scene();
    
    // Top gradient
    const topGradient = new THREE.Mesh(
      new THREE.SphereGeometry(5, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshBasicMaterial({ 
        color: 0x555555, // Brighter color (increased from 0x333333)
        side: THREE.BackSide
      })
    );
    envScene.add(topGradient);
    
    // Bottom gradient
    const bottomGradient = new THREE.Mesh(
      new THREE.SphereGeometry(5, 32, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
      new THREE.MeshBasicMaterial({ 
        color: 0x222222, // Brighter color (increased from 0x111111)
        side: THREE.BackSide
      })
    );
    envScene.add(bottomGradient);
    
    // Render the environment to a cube texture
    const cubeRenderTarget = new THREE.WebGLCubeRenderTarget(256);
    cubeRenderTarget.texture.type = THREE.HalfFloatType;
    
    const cubeCamera = new THREE.CubeCamera(0.1, 10, cubeRenderTarget);
    cubeCamera.position.set(0, 0, 0);
    cubeCamera.update(this.renderer, envScene);
    
    // Set the environment map for the scene
    this.scene.environment = cubeRenderTarget.texture;
  }

  // Reset camera to default position and rotation
  resetToDefaultView() {
    if (this.isUserInteracting) return; // Don't reset if user is still interacting
    
    // Enable auto-rotation again
    this.controls.autoRotate = true;
    
    // Smoothly animate back to default position
    const duration = 1000; // Animation duration in ms
    const startTime = Date.now();
    
    const startPosition = new THREE.Vector3().copy(this.camera.position);
    const startTarget = new THREE.Vector3().copy(this.controls.target);
    
    const animate = () => {
      if (this.isUserInteracting) return; // Stop animation if user interacts
      
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1); // Clamp between 0-1
      
      // Use smooth easing
      const eased = this.easeInOutQuad(progress);
      
      // Interpolate camera position
      this.camera.position.lerpVectors(
        startPosition,
        this.defaultCameraPosition, 
        eased
      );
      
      // Interpolate target
      this.controls.target.lerpVectors(
        startTarget,
        this.defaultTarget,
        eased
      );
      
      // Update controls
      this.controls.update();
      
      // Continue animation if not complete
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }
  
  // Easing function for smooth transition
  easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }

  // Update camera and renderer when container size changes
  onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight; // Update aspect ratio
    this.camera.updateProjectionMatrix(); // Apply the new aspect ratio
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight); // Resize renderer
  }

  // Animation loop - continuously renders the scene
  animate() {
    requestAnimationFrame(this.animate.bind(this)); // Schedule next frame
    
    // Get elapsed time
    const delta = this.clock.getDelta();
    
    // Update controls
    this.controls.update(); // Update controls (needed for damping and auto-rotation)
    
    // Update countdown position if visible for smoother following
    if (this.resetCountdown && this.resetCountdown.style.display === 'block') {
      this.updateCountdownPosition();
    }
    
    // Render the scene
    this.renderer.render(this.scene, this.camera); // Render the scene from camera's perspective
  }
} 