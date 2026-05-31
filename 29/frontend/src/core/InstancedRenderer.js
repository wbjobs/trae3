import * as THREE from 'three';

function checkInstancedMeshSupport() {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return false;
  return gl.getExtension('ANGLE_instanced_arrays') !== null;
}

const INSTANCED_MESH_SUPPORTED = checkInstancedMeshSupport();
const MIN_INSTANCE_COUNT = 50;

export function mergeGeometries(geometries, transforms = []) {
  if (!geometries || geometries.length === 0) {
    return null;
  }

  if (geometries.length === 1) {
    return geometries[0].clone();
  }

  const useTransforms = transforms.length === geometries.length;
  const attributes = {};
  const attributeNames = new Set();
  const morphAttributeNames = new Set();
  const morphTargetsRelative = geometries[0].morphTargetsRelative;

  geometries.forEach((geometry) => {
    Object.keys(geometry.attributes).forEach((name) => {
      attributeNames.add(name);
    });
    if (geometry.morphAttributes) {
      Object.keys(geometry.morphAttributes).forEach((name) => {
        morphAttributeNames.add(name);
      });
    }
  });

  let indexCount = 0;
  let vertexCount = 0;

  geometries.forEach((geometry) => {
    const vertexCountThis = geometry.attributes.position.count;
    const indexCountThis = geometry.index ? geometry.index.count : vertexCountThis;
    vertexCount += vertexCountThis;
    indexCount += indexCountThis;
  });

  attributeNames.forEach((name) => {
    const firstAttribute = geometries[0].attributes[name];
    if (!firstAttribute) return;

    const itemSize = firstAttribute.itemSize;
    const normalized = firstAttribute.normalized;
    const TypedArray = firstAttribute.array.constructor;

    attributes[name] = new THREE.BufferAttribute(
      new TypedArray(vertexCount * itemSize),
      itemSize,
      normalized
    );
  });

  let indices = null;
  if (geometries[0].index) {
    indices = new THREE.BufferAttribute(new Uint32Array(indexCount), 1);
  }

  const morphAttributes = {};
  morphAttributeNames.forEach((name) => {
    morphAttributes[name] = [];
    const firstMorph = geometries[0].morphAttributes[name];
    if (!firstMorph) return;

    for (let i = 0; i < firstMorph.length; i++) {
      const itemSize = firstMorph[i].itemSize;
      const TypedArray = firstMorph[i].array.constructor;
      morphAttributes[name].push(
        new THREE.BufferAttribute(new TypedArray(vertexCount * itemSize), itemSize)
      );
    }
  });

  let indexOffset = 0;
  let vertexOffset = 0;

  geometries.forEach((geometry, geometryIndex) => {
    const transform = useTransforms ? transforms[geometryIndex] : null;
    const vertexCountThis = geometry.attributes.position.count;
    const indexCountThis = geometry.index ? geometry.index.count : vertexCountThis;

    if (geometry.index && indices) {
      for (let i = 0; i < indexCountThis; i++) {
        indices.setX(indexOffset + i, geometry.index.getX(i) + vertexOffset);
      }
    }

    attributeNames.forEach((name) => {
      const sourceAttribute = geometry.attributes[name];
      const targetAttribute = attributes[name];
      if (!sourceAttribute || !targetAttribute) return;

      const itemSize = sourceAttribute.itemSize;

      for (let i = 0; i < vertexCountThis; i++) {
        const sourceIndex = i * itemSize;
        const targetIndex = (vertexOffset + i) * itemSize;

        if (name === 'position' && transform) {
          const x = sourceAttribute.array[sourceIndex];
          const y = sourceAttribute.array[sourceIndex + 1];
          const z = sourceAttribute.array[sourceIndex + 2];
          const v = new THREE.Vector3(x, y, z).applyMatrix4(transform);
          targetAttribute.array[targetIndex] = v.x;
          targetAttribute.array[targetIndex + 1] = v.y;
          targetAttribute.array[targetIndex + 2] = v.z;
        } else if (name === 'normal' && transform) {
          const x = sourceAttribute.array[sourceIndex];
          const y = sourceAttribute.array[sourceIndex + 1];
          const z = sourceAttribute.array[sourceIndex + 2];
          const v = new THREE.Vector3(x, y, z).transformDirection(transform);
          targetAttribute.array[targetIndex] = v.x;
          targetAttribute.array[targetIndex + 1] = v.y;
          targetAttribute.array[targetIndex + 2] = v.z;
        } else {
          for (let j = 0; j < itemSize; j++) {
            targetAttribute.array[targetIndex + j] = sourceAttribute.array[sourceIndex + j];
          }
        }
      }
    });

    morphAttributeNames.forEach((name) => {
      const sourceMorphs = geometry.morphAttributes[name];
      const targetMorphs = morphAttributes[name];
      if (!sourceMorphs || !targetMorphs) return;

      for (let m = 0; m < sourceMorphs.length; m++) {
        const sourceAttribute = sourceMorphs[m];
        const targetAttribute = targetMorphs[m];
        if (!sourceAttribute || !targetAttribute) continue;

        const itemSize = sourceAttribute.itemSize;
        for (let i = 0; i < vertexCountThis; i++) {
          const sourceIndex = i * itemSize;
          const targetIndex = (vertexOffset + i) * itemSize;

          if (name === 'position' && transform && !morphTargetsRelative) {
            const x = sourceAttribute.array[sourceIndex];
            const y = sourceAttribute.array[sourceIndex + 1];
            const z = sourceAttribute.array[sourceIndex + 2];
            const v = new THREE.Vector3(x, y, z).applyMatrix4(transform);
            targetAttribute.array[targetIndex] = v.x;
            targetAttribute.array[targetIndex + 1] = v.y;
            targetAttribute.array[targetIndex + 2] = v.z;
          } else if (name === 'normal' && transform && !morphTargetsRelative) {
            const x = sourceAttribute.array[sourceIndex];
            const y = sourceAttribute.array[sourceIndex + 1];
            const z = sourceAttribute.array[sourceIndex + 2];
            const v = new THREE.Vector3(x, y, z).transformDirection(transform);
            targetAttribute.array[targetIndex] = v.x;
            targetAttribute.array[targetIndex + 1] = v.y;
            targetAttribute.array[targetIndex + 2] = v.z;
          } else {
            for (let j = 0; j < itemSize; j++) {
              targetAttribute.array[targetIndex + j] = sourceAttribute.array[sourceIndex + j];
            }
          }
        }
      }
    });

    vertexOffset += vertexCountThis;
    indexOffset += indexCountThis;
  });

  const mergedGeometry = new THREE.BufferGeometry();

  Object.keys(attributes).forEach((name) => {
    mergedGeometry.setAttribute(name, attributes[name]);
  });

  if (indices) {
    mergedGeometry.setIndex(indices);
  }

  if (Object.keys(morphAttributes).length > 0) {
    mergedGeometry.morphAttributes = morphAttributes;
    mergedGeometry.morphTargetsRelative = morphTargetsRelative;
  }

  mergedGeometry.computeBoundingSphere();
  mergedGeometry.computeBoundingBox();

  return mergedGeometry;
}

export function mergeMeshes(meshes) {
  if (!meshes || meshes.length === 0) {
    return null;
  }

  const geometries = [];
  const transforms = [];
  const materials = new Map();

  meshes.forEach((mesh) => {
    if (!mesh.isMesh) return;

    mesh.updateMatrixWorld(true);
    geometries.push(mesh.geometry);
    transforms.push(mesh.matrixWorld.clone());

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m, i) => {
        const key = `mat_${materials.size}_${i}`;
        if (!materials.has(key)) {
          materials.set(key, m);
        }
      });
    } else {
      const key = `mat_${materials.size}`;
      if (!materials.has(key)) {
        materials.set(key, mesh.material);
      }
    }
  });

  if (geometries.length === 0) {
    return null;
  }

  const uniqueMaterials = Array.from(materials.values());
  const mergedGeometry = mergeGeometries(geometries, transforms);

  if (uniqueMaterials.length === 1) {
    return new THREE.Mesh(mergedGeometry, uniqueMaterials[0]);
  }

  return new THREE.Mesh(mergedGeometry, uniqueMaterials);
}

export function createOctree(objects, maxDepth = 4) {
  class OctreeNode {
    constructor(bounds, depth = 0) {
      this.bounds = bounds;
      this.depth = depth;
      this.objects = [];
      this.children = [];
    }

    contains(object) {
      const box = new THREE.Box3().setFromObject(object);
      return this.bounds.containsBox(box);
    }

    intersects(object) {
      const box = new THREE.Box3().setFromObject(object);
      return this.bounds.intersectsBox(box);
    }

    split() {
      if (this.depth >= maxDepth) return;

      const min = this.bounds.min;
      const max = this.bounds.max;
      const mid = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);

      const corners = [
        new THREE.Vector3(min.x, min.y, min.z),
        new THREE.Vector3(mid.x, min.y, min.z),
        new THREE.Vector3(min.x, mid.y, min.z),
        new THREE.Vector3(mid.x, mid.y, min.z),
        new THREE.Vector3(min.x, min.y, mid.z),
        new THREE.Vector3(mid.x, min.y, mid.z),
        new THREE.Vector3(min.x, mid.y, mid.z),
        new THREE.Vector3(mid.x, mid.y, mid.z)
      ];

      for (let i = 0; i < 8; i++) {
        const childMin = corners[i];
        const childMax = new THREE.Vector3(
          i & 1 ? max.x : mid.x,
          i & 2 ? max.y : mid.y,
          i & 4 ? max.z : mid.z
        );
        const childBounds = new THREE.Box3(childMin, childMax);
        this.children.push(new OctreeNode(childBounds, this.depth + 1));
      }

      const remainingObjects = [];
      for (const obj of this.objects) {
        let placed = false;
        for (const child of this.children) {
          if (child.contains(obj)) {
            child.objects.push(obj);
            placed = true;
            break;
          }
        }
        if (!placed) {
          remainingObjects.push(obj);
        }
      }
      this.objects = remainingObjects;

      for (const child of this.children) {
        if (child.objects.length > 8) {
          child.split();
        }
      }
    }

    query(frustum, result = []) {
      if (!frustum.intersectsBox(this.bounds)) {
        return result;
      }

      for (const obj of this.objects) {
        if (obj.visible) {
          const sphere = obj.geometry?.boundingSphere;
          if (sphere) {
            const center = sphere.center.clone().applyMatrix4(obj.matrixWorld);
            const testSphere = new THREE.Sphere(center, sphere.radius);
            if (frustum.intersectsSphere(testSphere)) {
              result.push(obj);
            }
          } else {
            result.push(obj);
          }
        }
      }

      for (const child of this.children) {
        child.query(frustum, result);
      }

      return result;
    }
  }

  if (!objects || objects.length === 0) {
    return {
      root: null,
      query: () => []
    };
  }

  const bounds = new THREE.Box3();
  for (const obj of objects) {
    bounds.expandByObject(obj);
  }

  const padding = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.1);
  bounds.min.sub(padding);
  bounds.max.add(padding);

  const root = new OctreeNode(bounds, 0);
  root.objects = objects.filter((obj) => root.intersects(obj));

  if (root.objects.length > 8) {
    root.split();
  }

  return {
    root,
    bounds,
    query: (frustum) => root.query(frustum, [])
  };
}

export class FrustumCuller {
  constructor(options = {}) {
    this.options = {
      useOctree: true,
      octreeMaxDepth: 4,
      dynamicUpdateInterval: 1,
      ...options
    };

    this.frustum = new THREE.Frustum();
    this.projScreenMatrix = new THREE.Matrix4();
    this.staticObjects = [];
    this.dynamicObjects = [];
    this.staticOctree = null;
    this.lastDynamicUpdate = 0;
    this.frameCount = 0;
    this.stats = {
      totalStatic: 0,
      totalDynamic: 0,
      culledStatic: 0,
      culledDynamic: 0
    };
  }

  addObject(object, isStatic = false) {
    if (!object || !object.isObject3D) return;

    const meshObjects = [];
    object.traverse((child) => {
      if (child.isMesh) {
        meshObjects.push(child);
      }
    });

    if (meshObjects.length === 0) {
      meshObjects.push(object);
    }

    meshObjects.forEach((mesh) => {
      if (!mesh.geometry?.boundingSphere) {
        mesh.geometry.computeBoundingSphere();
      }
      mesh.userData._cullData = {
        originalVisible: mesh.visible,
        isStatic
      };

      if (isStatic) {
        this.staticObjects.push(mesh);
      } else {
        this.dynamicObjects.push(mesh);
      }
    });

    if (isStatic && this.options.useOctree) {
      this.rebuildOctree();
    }

    this.stats.totalStatic = this.staticObjects.length;
    this.stats.totalDynamic = this.dynamicObjects.length;
  }

  removeObject(object) {
    if (!object) return;

    const removeFromArray = (arr, obj) => {
      const index = arr.indexOf(obj);
      if (index > -1) {
        arr.splice(index, 1);
        if (obj.userData._cullData) {
          obj.visible = obj.userData._cullData.originalVisible;
          delete obj.userData._cullData;
        }
        return true;
      }
      return false;
    };

    object.traverse((child) => {
      if (child.isMesh) {
        removeFromArray(this.staticObjects, child);
        removeFromArray(this.dynamicObjects, child);
      }
    });

    if (this.options.useOctree) {
      this.rebuildOctree();
    }

    this.stats.totalStatic = this.staticObjects.length;
    this.stats.totalDynamic = this.dynamicObjects.length;
  }

  rebuildOctree() {
    if (this.staticObjects.length > 0) {
      this.staticOctree = createOctree(this.staticObjects, this.options.octreeMaxDepth);
    } else {
      this.staticOctree = null;
    }
  }

  update(camera) {
    this.frameCount++;
    this.projScreenMatrix.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    this.frustum.setFromProjectionMatrix(this.projScreenMatrix);

    this.stats.culledStatic = 0;
    this.stats.culledDynamic = 0;

    if (this.options.useOctree && this.staticOctree) {
      const visibleStatic = this.staticOctree.query(this.frustum);
      const visibleSet = new Set(visibleStatic);

      for (const mesh of this.staticObjects) {
        const wasVisible = mesh.visible;
        mesh.visible = visibleSet.has(mesh);
        if (wasVisible && !mesh.visible) {
          this.stats.culledStatic++;
        }
      }
    } else {
      for (const mesh of this.staticObjects) {
        const sphere = mesh.geometry.boundingSphere;
        if (sphere) {
          const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
          const testSphere = new THREE.Sphere(center, sphere.radius);
          const wasVisible = mesh.visible;
          mesh.visible = this.frustum.intersectsSphere(testSphere);
          if (wasVisible && !mesh.visible) {
            this.stats.culledStatic++;
          }
        }
      }
    }

    const shouldUpdateDynamic = 
      this.frameCount - this.lastDynamicUpdate >= this.options.dynamicUpdateInterval;

    if (shouldUpdateDynamic) {
      this.lastDynamicUpdate = this.frameCount;

      for (const mesh of this.dynamicObjects) {
        if (!mesh.geometry?.boundingSphere) {
          mesh.geometry.computeBoundingSphere();
        }

        const sphere = mesh.geometry.boundingSphere;
        if (sphere) {
          mesh.updateMatrixWorld(true);
          const center = sphere.center.clone().applyMatrix4(mesh.matrixWorld);
          const testSphere = new THREE.Sphere(center, sphere.radius);
          const wasVisible = mesh.visible;
          mesh.visible = this.frustum.intersectsSphere(testSphere);
          if (wasVisible && !mesh.visible) {
            this.stats.culledDynamic++;
          }
        }
      }
    }

    return this.stats;
  }

  getStats() {
    return { ...this.stats };
  }

  reset() {
    [...this.staticObjects, ...this.dynamicObjects].forEach((mesh) => {
      if (mesh.userData._cullData) {
        mesh.visible = mesh.userData._cullData.originalVisible;
        delete mesh.userData._cullData;
      }
    });

    this.staticObjects = [];
    this.dynamicObjects = [];
    this.staticOctree = null;
    this.lastDynamicUpdate = 0;
    this.frameCount = 0;
    this.stats = {
      totalStatic: 0,
      totalDynamic: 0,
      culledStatic: 0,
      culledDynamic: 0
    };
  }

  dispose() {
    this.reset();
    this.frustum = null;
    this.projScreenMatrix = null;
  }
}

export class InstancedRenderer {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.options = {
      enabled: true,
      minInstanceCount: MIN_INSTANCE_COUNT,
      autoRebuild: false,
      rebuildInterval: 1000,
      enableCulling: true,
      cullOptions: {},
      ...options
    };

    this.enabled = this.options.enabled && INSTANCED_MESH_SUPPORTED;

    this.originalMeshes = new Map();
    this.instancedGroups = new Map();
    this.groupKeys = new Map();
    this.dummy = new THREE.Object3D();
    this.lastRebuild = 0;
    this.rebuildScheduled = false;

    this.frustumCuller = this.options.enableCulling 
      ? new FrustumCuller(this.options.cullOptions) 
      : null;

    this.stats = {
      originalDrawCalls: 0,
      instancedDrawCalls: 0,
      totalInstances: 0,
      activeGroups: 0,
      culledCount: 0
    };

    this._meshIdCounter = 0;
  }

  _getGroupKey(mesh) {
    const geometry = mesh.geometry;
    const material = mesh.material;

    const geoKey = geometry.uuid;
    let matKey;

    if (Array.isArray(material)) {
      matKey = material.map((m) => m.uuid).join(',');
    } else {
      matKey = material.uuid;
    }

    let colorKey = 'default';
    if (material.color) {
      colorKey = `#${material.color.getHexString()}`;
    } else if (Array.isArray(material)) {
      colorKey = material.map((m) => m.color ? `#${m.color.getHexString()}` : '').join(',');
    }

    return `${geoKey}|${matKey}|${colorKey}`;
  }

  _extractUserData(mesh) {
    const userData = { ...mesh.userData };
    delete userData._instancedId;
    delete userData._instancedGroupKey;
    delete userData._originalVisible;
    return userData;
  }

  registerMesh(mesh, groupKey = null) {
    if (!mesh || !mesh.isMesh) {
      console.warn('InstancedRenderer: Invalid mesh provided to registerMesh');
      return false;
    }

    if (!this.enabled) {
      return false;
    }

    const meshId = mesh.userData._instancedId || `mesh_${this._meshIdCounter++}`;
    if (this.originalMeshes.has(meshId)) {
      console.warn('InstancedRenderer: Mesh already registered');
      return false;
    }

    const key = groupKey || this._getGroupKey(mesh);

    mesh.userData._instancedId = meshId;
    mesh.userData._instancedGroupKey = key;
    mesh.userData._originalVisible = mesh.visible;

    this.originalMeshes.set(meshId, {
      mesh,
      groupKey: key,
      userData: this._extractUserData(mesh),
      matrix: mesh.matrix.clone(),
      visible: mesh.visible
    });

    if (!this.groupKeys.has(key)) {
      this.groupKeys.set(key, {
        geometry: mesh.geometry,
        material: mesh.material,
        meshes: []
      });
    }
    this.groupKeys.get(key).meshes.push(meshId);

    if (this.options.autoRebuild) {
      this.scheduleRebuild();
    }

    return true;
  }

  registerMeshes(meshes, groupKey = null) {
    if (!Array.isArray(meshes)) {
      console.warn('InstancedRenderer: registerMeshes requires an array');
      return 0;
    }

    let registered = 0;
    for (const mesh of meshes) {
      if (this.registerMesh(mesh, groupKey)) {
        registered++;
      }
    }

    if (registered > 0 && this.options.autoRebuild) {
      this.scheduleRebuild();
    }

    return registered;
  }

  updateInstanceMatrix(mesh, matrix) {
    if (!mesh || !mesh.userData._instancedId) {
      return false;
    }

    const meshId = mesh.userData._instancedId;
    const meshData = this.originalMeshes.get(meshId);
    if (!meshData) {
      return false;
    }

    if (matrix) {
      meshData.matrix.copy(matrix);
      mesh.matrix.copy(matrix);
    } else {
      mesh.updateMatrix();
      meshData.matrix.copy(mesh.matrix);
    }

    const groupKey = meshData.groupKey;
    const group = this.instancedGroups.get(groupKey);
    if (group && group.instancedMesh) {
      const index = group.meshIndices.get(meshId);
      if (index !== undefined) {
        this.dummy.matrix.copy(meshData.matrix);
        this.dummy.updateMatrix();
        group.instancedMesh.setMatrixAt(index, this.dummy.matrix);
        group.instancedMesh.instanceMatrix.needsUpdate = true;
      }
    }

    return true;
  }

  scheduleRebuild() {
    if (this.rebuildScheduled) return;

    const now = Date.now();
    const timeSinceLastRebuild = now - this.lastRebuild;

    if (timeSinceLastRebuild >= this.options.rebuildInterval) {
      this.rebuild();
    } else {
      this.rebuildScheduled = true;
      setTimeout(() => {
        this.rebuildScheduled = false;
        this.rebuild();
      }, this.options.rebuildInterval - timeSinceLastRebuild);
    }
  }

  rebuild() {
    this.disposeInstancedMeshes();

    if (!this.enabled) {
      return;
    }

    this.lastRebuild = Date.now();

    this.groupKeys.forEach((groupData, key) => {
      const meshCount = groupData.meshes.length;

      if (meshCount < this.options.minInstanceCount) {
        groupData.meshes.forEach((meshId) => {
          const meshData = this.originalMeshes.get(meshId);
          if (meshData && meshData.mesh.parent !== this.scene) {
            this.scene.add(meshData.mesh);
            meshData.mesh.visible = meshData.visible;
          }
        });
        return;
      }

      const instancedMesh = new THREE.InstancedMesh(
        groupData.geometry,
        groupData.material,
        meshCount
      );

      instancedMesh.frustumCulled = false;
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;

      const meshIndices = new Map();
      const userDatas = [];

      groupData.meshes.forEach((meshId, index) => {
        const meshData = this.originalMeshes.get(meshId);
        if (!meshData) return;

        if (meshData.mesh.parent) {
          meshData.mesh.parent.remove(meshData.mesh);
        }
        meshData.mesh.visible = false;

        this.dummy.matrix.copy(meshData.matrix);
        this.dummy.updateMatrix();
        instancedMesh.setMatrixAt(index, this.dummy.matrix);

        if (groupData.material && !Array.isArray(groupData.material)) {
          const originalMaterial = meshData.mesh.material;
          if (originalMaterial && originalMaterial.color) {
            instancedMesh.setColorAt(index, originalMaterial.color);
          }
        }

        meshIndices.set(meshId, index);
        userDatas.push(meshData.userData);
      });

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) {
        instancedMesh.instanceColor.needsUpdate = true;
      }

      instancedMesh.userData = {
        isInstanced: true,
        groupKey: key,
        userDatas,
        originalMeshes: groupData.meshes
      };

      this.scene.add(instancedMesh);

      this.instancedGroups.set(key, {
        instancedMesh,
        meshIndices,
        meshCount
      });

      if (this.frustumCuller) {
        this.frustumCuller.addObject(instancedMesh, true);
      }
    });

    this.updateStats();
  }

  updateCulling(camera) {
    if (!this.options.enableCulling || !this.frustumCuller || !camera) {
      return null;
    }

    const cullStats = this.frustumCuller.update(camera);
    this.stats.culledCount = cullStats.culledStatic + cullStats.culledDynamic;

    return cullStats;
  }

  updateStats() {
    let originalDrawCalls = 0;
    let instancedDrawCalls = 0;
    let totalInstances = 0;

    this.groupKeys.forEach((groupData) => {
      const meshCount = groupData.meshes.length;
      originalDrawCalls += meshCount;

      if (meshCount >= this.options.minInstanceCount) {
        instancedDrawCalls += 1;
        totalInstances += meshCount;
      } else {
        instancedDrawCalls += meshCount;
      }
    });

    this.stats.originalDrawCalls = originalDrawCalls;
    this.stats.instancedDrawCalls = instancedDrawCalls;
    this.stats.totalInstances = totalInstances;
    this.stats.activeGroups = this.instancedGroups.size;
  }

  getStats() {
    const reduction = this.stats.originalDrawCalls > 0
      ? ((1 - this.stats.instancedDrawCalls / this.stats.originalDrawCalls) * 100).toFixed(1)
      : 0;

    return {
      ...this.stats,
      drawCallReduction: `${reduction}%`,
      isSupported: INSTANCED_MESH_SUPPORTED,
      isEnabled: this.enabled,
      minInstanceCount: this.options.minInstanceCount
    };
  }

  disposeInstancedMeshes() {
    this.instancedGroups.forEach((group) => {
      if (group.instancedMesh) {
        if (this.frustumCuller) {
          this.frustumCuller.removeObject(group.instancedMesh);
        }
        this.scene.remove(group.instancedMesh);
        group.instancedMesh.geometry = null;
        group.instancedMesh.material = null;
        group.instancedMesh.dispose();
      }
    });

    this.instancedGroups.clear();

    this.originalMeshes.forEach((meshData) => {
      if (meshData.mesh && meshData.visible) {
        meshData.mesh.visible = meshData.visible;
        if (!meshData.mesh.parent) {
          this.scene.add(meshData.mesh);
        }
      }
    });
  }

  dispose() {
    this.disposeInstancedMeshes();

    if (this.frustumCuller) {
      this.frustumCuller.dispose();
      this.frustumCuller = null;
    }

    this.originalMeshes.forEach((meshData) => {
      if (meshData.mesh) {
        delete meshData.mesh.userData._instancedId;
        delete meshData.mesh.userData._instancedGroupKey;
        delete meshData.mesh.userData._originalVisible;
      }
    });

    this.originalMeshes.clear();
    this.groupKeys.clear();
    this.stats = {
      originalDrawCalls: 0,
      instancedDrawCalls: 0,
      totalInstances: 0,
      activeGroups: 0,
      culledCount: 0
    };
  }
}

export default InstancedRenderer;
