import { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import * as THREE from 'three';

const TEXTURE_URL = 'https://placehold.co/800x600/4a90d9/ffffff?text=Design+Preview';

function CardModel({ designUrl }) {
  const mesh = useRef();
  const texture = useLoader(THREE.TextureLoader, designUrl || TEXTURE_URL);
  useFrame(() => { if (mesh.current) mesh.current.rotation.y += 0.003; });
  return (
    <mesh ref={mesh} rotation={[-0.3, 0.4, 0]} castShadow>
      <boxGeometry args={[3.5, 2, 0.05]} />
      <meshStandardMaterial map={texture} metalness={0.05} roughness={0.8} />
    </mesh>
  );
}

function MugModel({ designUrl }) {
  const group = useRef();
  const texture = useLoader(THREE.TextureLoader, designUrl || TEXTURE_URL);
  useFrame(() => { if (group.current) group.current.rotation.y += 0.005; });
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[1.2, 0.9, 2.5, 32]} />
        <meshStandardMaterial map={texture} roughness={0.4} metalness={0.1} />
      </mesh>
      <mesh position={[0.9, 0.8, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <torusGeometry args={[0.5, 0.1, 8, 16]} />
        <meshStandardMaterial color="#888" roughness={0.3} metalness={0.2} />
      </mesh>
    </group>
  );
}

function FrameModel({ designUrl }) {
  const group = useRef();
  const texture = useLoader(THREE.TextureLoader, designUrl || TEXTURE_URL);
  useFrame(() => { if (group.current) group.current.rotation.y += 0.003; });
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[3.5, 2.8, 0.15]} />
        <meshStandardMaterial color="#8B4513" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.11]}>
        <planeGeometry args={[3, 2.3]} />
        <meshStandardMaterial map={texture} />
      </mesh>
    </group>
  );
}

function BookModel({ designUrl }) {
  const group = useRef();
  const texture = useLoader(THREE.TextureLoader, designUrl || TEXTURE_URL);
  useFrame(() => { if (group.current) group.current.rotation.y += 0.003; });
  return (
    <group ref={group} rotation={[-0.2, 0.3, 0]}>
      <mesh position={[0, 0, 0.8]} castShadow>
        <boxGeometry args={[4, 3, 1.6]} />
        <meshStandardMaterial color="#f5f5f0" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, 1.61]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial map={texture} />
      </mesh>
      <mesh position={[2.01, 0, 0.8]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.6, 3]} />
        <meshStandardMaterial color="#f5f5f0" />
      </mesh>
    </group>
  );
}

function MementoModel({ designUrl }) {
  const group = useRef();
  const texture = useLoader(THREE.TextureLoader, designUrl || TEXTURE_URL);
  useFrame(() => { if (group.current) group.current.rotation.y += 0.004; });
  return (
    <group ref={group}>
      <mesh position={[0, 0.8, 0]} castShadow>
        <boxGeometry args={[2, 1.6, 0.8]} />
        <meshStandardMaterial map={texture} roughness={0.3} metalness={0.4} />
      </mesh>
      <mesh position={[0, -0.6, 0]} castShadow>
        <boxGeometry args={[2.8, 0.4, 1.4]} />
        <meshStandardMaterial color="#333" roughness={0.8} />
      </mesh>
    </group>
  );
}

const MODELS = {
  'business-card': CardModel,
  'wedding-card': CardModel,
  'id-card': CardModel,
  mug: MugModel,
  'photo-frame': FrameModel,
  frame: FrameModel,
  book: BookModel,
  'offset-book': BookModel,
  memento: MementoModel,
  default: CardModel,
};

function Scene({ productType, designUrl }) {
  const ModelComponent = MODELS[productType] || MODELS.default;
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} castShadow />
      <directionalLight position={[-3, 5, -3]} intensity={0.3} />
      <ModelComponent designUrl={designUrl} />
      <OrbitControls enablePan={false} minDistance={3} maxDistance={10} />
      <Environment preset="city" />
    </>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm text-gray-500">Loading 3D preview...</p>
      </div>
    </div>
  );
}

function ErrorFallback({ onRetry }) {
  return (
    <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
      <div className="text-center">
        <p className="text-sm text-red-500 mb-2">Could not load 3D preview</p>
        <button onClick={onRetry} className="text-xs text-blue-600 underline">Try again</button>
      </div>
    </div>
  );
}

export default function Product3DPreview({ productType = 'default', designUrl, height = 300, interactive = true }) {
  const [hasError, setHasError] = useState(false);
  const [key, setKey] = useState(0);

  const handleError = useCallback(() => setHasError(true), []);
  const handleRetry = useCallback(() => { setHasError(false); setKey(k => k + 1); }, []);

  useEffect(() => { setHasError(false); }, [designUrl, productType]);

  if (!interactive) {
    return (
      <div className="bg-gray-100 rounded-lg overflow-hidden" style={{ height }}>
        <Canvas camera={{ position: [0, 0, 5], fov: 45 }} onCreated={({ gl }) => { gl.setClearColor('#f8f9fa'); }}>
          <Scene productType={productType} designUrl={designUrl} />
        </Canvas>
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height }}>
      {hasError ? (
        <ErrorFallback onRetry={handleRetry} />
      ) : (
        <Canvas key={key} camera={{ position: [0, 0, 5], fov: 45 }} onError={handleError}
          onCreated={({ gl }) => { gl.setClearColor('#f8f9fa'); }}
          fallback={<LoadingFallback />}>
          <Scene productType={productType} designUrl={designUrl} />
        </Canvas>
      )}
    </div>
  );
}
