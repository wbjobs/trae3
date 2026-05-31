import * as THREE from 'three';
import * as TWEEN from '@tweenjs/tween.js';

export class AnimationManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = {
      particleCount: 100,
      particleSpeed: 2,
      particleSize: 2,
      defaultAnimationDuration: 1000,
      ...options
    };

    this.animations = new Map();
    this.particleSystems = new Map();
    this.isPaused = false;
    this.clock = new THREE.Clock();
    this._tweenGroups = new Map();
  }

  update() {
    if (this.isPaused) return;

    const delta = this.clock.getDelta();

    TWEEN.update();

    this.animations.forEach((anim, key) => {
      if (anim.enabled && anim.update) {
        anim.update(delta);
      }
    });

    this.particleSystems.forEach((system) => {
      if (system.enabled) {
        this._updateParticleSystem(system, delta);
      }
    });
  }

  play() {
    this.isPaused = false;
    this.animations.forEach(anim => {
      if (anim.tween) anim.tween.resume();
    });
  }

  pause() {
    this.isPaused = true;
    this.animations.forEach(anim => {
      if (anim.tween) anim.tween.pause();
    });
  }

  toggle() {
    if (this.isPaused) {
      this.play();
    } else {
      this.pause();
    }
  }

  stopAnimation(key) {
    const anim = this.animations.get(key);
    if (anim) {
      if (anim.tween) {
        anim.tween.stop();
      }
      if (anim.cleanup) {
        anim.cleanup();
      }
      this.animations.delete(key);
    }
  }

  stopAllAnimations() {
    this.animations.forEach((anim, key) => {
      this.stopAnimation(key);
    });
    this.animations.clear();
  }

  startFanRotation(fanObject, options = {}) {
    const key = `fan_${fanObject.uuid}`;
    
    if (this.animations.has(key)) {
      this.animations.get(key).enabled = true;
      return key;
    }

    const {
      speed = Math.PI,
      axis = 'y',
      startAngle = 0
    } = options;

    fanObject.rotation[axis] = startAngle;

    const anim = {
      type: 'fanRotation',
      enabled: true,
      object: fanObject,
      speed,
      axis,
      update: (delta) => {
        fanObject.rotation[axis] += speed * delta;
      }
    };

    this.animations.set(key, anim);
    return key;
  }

  stopFanRotation(fanObject) {
    const key = `fan_${fanObject.uuid}`;
    this.stopAnimation(key);
  }

  createFlowParticles(pipeObject, options = {}) {
    const key = `flow_${pipeObject.uuid}`;
    
    if (this.particleSystems.has(key)) {
      return key;
    }

    const {
      particleCount = this.options.particleCount,
      speed = this.options.particleSpeed,
      size = this.options.particleSize,
      color = 0x00ffff,
      opacity = 0.8,
      flowDirection = null
    } = options;

    const pipeGeometry = pipeObject.geometry;
    if (!pipeGeometry) {
      console.warn('Pipe object has no geometry');
      return null;
    }

    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);

    const boundingBox = new THREE.Box3().setFromObject(pipeObject);
    const center = boundingBox.getCenter(new THREE.Vector3());
    const sizeVec = boundingBox.getSize(new THREE.Vector3());

    let direction = flowDirection;
    if (!direction) {
      if (sizeVec.x >= sizeVec.y && sizeVec.x >= sizeVec.z) {
        direction = new THREE.Vector3(1, 0, 0);
      } else if (sizeVec.y >= sizeVec.x && sizeVec.y >= sizeVec.z) {
        direction = new THREE.Vector3(0, 1, 0);
      } else {
        direction = new THREE.Vector3(0, 0, 1);
      }
    }
    direction.normalize();

    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      const t = Math.random();
      
      const offsetX = (Math.random() - 0.5) * sizeVec.x * 0.8;
      const offsetY = (Math.random() - 0.5) * sizeVec.y * 0.8;
      const offsetZ = (Math.random() - 0.5) * sizeVec.z * 0.8;
      
      const startPoint = center.clone()
        .add(new THREE.Vector3(offsetX, offsetY, offsetZ))
        .add(direction.clone().multiplyScalar(-sizeVec.length() * 0.5 * t));

      positions[i3] = startPoint.x;
      positions[i3 + 1] = startPoint.y;
      positions[i3 + 2] = startPoint.z;

      originalPositions[i3] = startPoint.x;
      originalPositions[i3 + 1] = startPoint.y;
      originalPositions[i3 + 2] = startPoint.z;

      const velocity = direction.clone().multiplyScalar(speed);
      velocities[i3] = velocity.x;
      velocities[i3 + 1] = velocity.y;
      velocities[i3 + 2] = velocity.z;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREE.Points(geometry, material);
    points.name = `FlowParticles_${pipeObject.name}`;

    this.scene.add(points);

    const system = {
      type: 'flowParticles',
      enabled: true,
      pipe: pipeObject,
      points,
      material,
      geometry,
      velocities,
      originalPositions,
      speed,
      boundingBox,
      direction,
      particleCount
    };

    this.particleSystems.set(key, system);
    return key;
  }

  _updateParticleSystem(system, delta) {
    const positions = system.geometry.attributes.position.array;
    const halfLength = system.boundingBox.getSize(new THREE.Vector3()).length() * 0.5;

    for (let i = 0; i < system.particleCount; i++) {
      const i3 = i * 3;

      positions[i3] += system.velocities[i3] * delta;
      positions[i3 + 1] += system.velocities[i3 + 1] * delta;
      positions[i3 + 2] += system.velocities[i3 + 2] * delta;

      const currentPos = new THREE.Vector3(
        positions[i3],
        positions[i3 + 1],
        positions[i3 + 2]
      );

      const center = system.boundingBox.getCenter(new THREE.Vector3());
      const toCenter = center.clone().sub(currentPos);
      const dist = toCenter.dot(system.direction);

      if (dist < -halfLength) {
        const resetPos = currentPos.clone().add(
          system.direction.clone().multiplyScalar(halfLength * 2)
        );
        positions[i3] = resetPos.x;
        positions[i3 + 1] = resetPos.y;
        positions[i3 + 2] = resetPos.z;
      }
    }

    system.geometry.attributes.position.needsUpdate = true;
  }

  stopFlowParticles(pipeObject) {
    const key = `flow_${pipeObject.uuid}`;
    const system = this.particleSystems.get(key);
    
    if (system) {
      this.scene.remove(system.points);
      system.geometry.dispose();
      system.material.dispose();
      this.particleSystems.delete(key);
    }
  }

  startBlinkAnnotation(annotationObject, options = {}) {
    const key = `blink_${annotationObject.uuid}`;
    
    if (this.animations.has(key)) {
      this.animations.get(key).enabled = true;
      return key;
    }

    const {
      duration = 500,
      minOpacity = 0.2,
      maxOpacity = 1
    } = options;

    const originalOpacity = annotationObject.material 
      ? annotationObject.material.opacity 
      : 1;

    const anim = {
      type: 'blink',
      enabled: true,
      object: annotationObject,
      tween: null,
      originalOpacity
    };

    const tweenObj = { opacity: maxOpacity };

    anim.tween = new TWEEN.Tween(tweenObj)
      .to({ opacity: minOpacity }, duration)
      .yoyo(true)
      .repeat(Infinity)
      .easing(TWEEN.Easing.Sinusoidal.InOut)
      .onUpdate(() => {
        if (annotationObject.material) {
          annotationObject.material.opacity = tweenObj.opacity;
          annotationObject.material.transparent = true;
        }
      })
      .start();

    anim.cleanup = () => {
      if (annotationObject.material) {
        annotationObject.material.opacity = originalOpacity;
      }
    };

    this.animations.set(key, anim);
    return key;
  }

  stopBlinkAnnotation(annotationObject) {
    const key = `blink_${annotationObject.uuid}`;
    this.stopAnimation(key);
  }

  startColorGradient(object, options = {}) {
    const key = `color_${object.uuid}`;
    
    if (this.animations.has(key)) {
      this.stopAnimation(key);
    }

    const {
      fromColor = 0xff0000,
      toColor = 0x00ff00,
      duration = this.options.defaultAnimationDuration,
      repeat = 1,
      yoyo = false,
      easing = TWEEN.Easing.Linear.None
    } = options;

    const originalColors = new Map();
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((m, i) => {
          originalColors.set(`${child.uuid}_${i}`, m.color.clone());
        });
      }
    });

    const tweenObj = { t: 0 };
    const from = new THREE.Color(fromColor);
    const to = new THREE.Color(toColor);
    const currentColor = new THREE.Color();

    const anim = {
      type: 'colorGradient',
      enabled: true,
      object,
      tween: null,
      originalColors
    };

    anim.tween = new TWEEN.Tween(tweenObj)
      .to({ t: 1 }, duration)
      .repeat(repeat)
      .yoyo(yoyo)
      .easing(easing)
      .onUpdate(() => {
        currentColor.lerpColors(from, to, tweenObj.t);
        object.traverse((child) => {
          if (child.isMesh && child.material) {
            const materials = Array.isArray(child.material) ? child.material : [child.material];
            materials.forEach(m => {
              m.color.copy(currentColor);
            });
          }
        });
      })
      .onComplete(() => {
        this.stopAnimation(key);
      })
      .start();

    anim.cleanup = () => {
      object.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach((m, i) => {
            const original = originalColors.get(`${child.uuid}_${i}`);
            if (original) {
              m.color.copy(original);
            }
          });
        }
      });
    };

    this.animations.set(key, anim);
    return key;
  }

  stopColorGradient(object) {
    const key = `color_${object.uuid}`;
    this.stopAnimation(key);
  }

  createCustomAnimation(key, updateFn, cleanupFn = null) {
    if (this.animations.has(key)) {
      this.stopAnimation(key);
    }

    const anim = {
      type: 'custom',
      enabled: true,
      update: updateFn,
      cleanup: cleanupFn
    };

    this.animations.set(key, anim);
    return key;
  }

  getAnimation(key) {
    return this.animations.get(key);
  }

  getParticleSystem(key) {
    return this.particleSystems.get(key);
  }

  enableAnimation(key, enabled = true) {
    const anim = this.animations.get(key);
    if (anim) {
      anim.enabled = enabled;
      if (anim.tween) {
        if (enabled) {
          anim.tween.resume();
        } else {
          anim.tween.pause();
        }
      }
    }
  }

  enableParticleSystem(key, enabled = true) {
    const system = this.particleSystems.get(key);
    if (system) {
      system.enabled = enabled;
      system.points.visible = enabled;
    }
  }

  dispose() {
    this.stopAllAnimations();
    
    this.particleSystems.forEach((system) => {
      this.scene.remove(system.points);
      system.geometry.dispose();
      system.material.dispose();
    });
    this.particleSystems.clear();
    
    this.animations.clear();
    this._tweenGroups.clear();
  }
}
