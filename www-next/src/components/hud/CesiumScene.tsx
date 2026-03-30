import { useEffect, useRef } from "react";
import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  createGooglePhotorealistic3DTileset,
  Ion,
  PerspectiveFrustum,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { InterpolatedState } from "./useInterpolation";

// Cesium Ion access token (provided by user)
Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZWRjMWYxOS0xZDExLTQyYWQtYjA5OS05ZjFjNzIyMjRjZGMiLCJpZCI6NDExNDM0LCJpYXQiOjE3NzQ4OTM0NDR9.cZWL8MxEOKxh7Pn9iG2THLaZG5Dk1E4tWlyC11iI-5U";

interface CesiumSceneProps {
  interpolated: InterpolatedState;
  isActive: boolean;
  cameraLocked: boolean;
}

export default function CesiumScene({
  interpolated,
  isActive,
  cameraLocked,
}: CesiumSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const userHeadingOffset = useRef(0);
  const userPitchOffset = useRef(0);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dragState = useRef<{ startX: number; startY: number; startH: number; startP: number } | null>(null);

  // Initialize Cesium Viewer once
  useEffect(() => {
    if (!containerRef.current) return;

    const viewer = new Viewer(containerRef.current, {
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      creditContainer: document.createElement("div"), // hide credits
    });

    // Set 120deg FOV
    const frustum = viewer.camera.frustum as PerspectiveFrustum;
    frustum.fov = CesiumMath.toRadians(120);

    // Enable atmosphere/fog
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0003;
    viewer.scene.globe.enableLighting = true;

    // Disable default camera input (we control the camera)
    viewer.scene.screenSpaceCameraController.enableRotate = false;
    viewer.scene.screenSpaceCameraController.enableTranslate = false;
    viewer.scene.screenSpaceCameraController.enableZoom = false;
    viewer.scene.screenSpaceCameraController.enableTilt = false;
    viewer.scene.screenSpaceCameraController.enableLook = false;

    // Load Google 3D Tiles
    createGooglePhotorealistic3DTileset().then((tileset) => {
      viewer.scene.primitives.add(tileset);
      // Hide the base globe to avoid z-fighting
      viewer.scene.globe.show = false;
    });

    viewerRef.current = viewer;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  // Handle unlocked camera mouse drag
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!cameraLocked) {
      // Set up mouse handlers for free-look
      const handler = new ScreenSpaceEventHandler(viewer.scene.canvas as HTMLCanvasElement);

      handler.setInputAction((movement: { position: { x: number; y: number } }) => {
        dragState.current = {
          startX: movement.position.x,
          startY: movement.position.y,
          startH: userHeadingOffset.current,
          startP: userPitchOffset.current,
        };
      }, ScreenSpaceEventType.LEFT_DOWN);

      handler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
        if (!dragState.current) return;
        const dx = movement.endPosition.x - dragState.current.startX;
        const dy = movement.endPosition.y - dragState.current.startY;
        userHeadingOffset.current = dragState.current.startH + dx * 0.3;
        userPitchOffset.current = Math.max(-80, Math.min(80,
          dragState.current.startP - dy * 0.3
        ));
      }, ScreenSpaceEventType.MOUSE_MOVE);

      handler.setInputAction(() => {
        dragState.current = null;
      }, ScreenSpaceEventType.LEFT_UP);

      handlerRef.current = handler;
    } else {
      // Reset offsets when locking camera
      userHeadingOffset.current = 0;
      userPitchOffset.current = 0;
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    }
  }, [cameraLocked]);

  // Update camera from interpolated telemetry on each render
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !isActive) return;

    const { lat, lon, alt, roll, pitch, yaw } = interpolated;
    if (lat === 0 && lon === 0) return; // No valid position yet

    const position = Cartesian3.fromDegrees(lon, lat, alt);

    // Convert attitude to Cesium conventions
    // yaw: degrees CW from north -> heading in radians
    // pitch: degrees nose up -> negative in Cesium (looking down is negative)
    // roll: degrees right wing down
    let heading = CesiumMath.toRadians(yaw);
    let cameraPitch = CesiumMath.toRadians(pitch);
    const cameraRoll = CesiumMath.toRadians(roll);

    // Apply user offsets when unlocked
    if (!cameraLocked) {
      heading += CesiumMath.toRadians(userHeadingOffset.current);
      cameraPitch += CesiumMath.toRadians(userPitchOffset.current);
    }

    viewer.camera.setView({
      destination: position,
      orientation: {
        heading: heading,
        pitch: cameraPitch,
        roll: cameraRoll,
      },
    });
  });

  // Suspend/resume rendering
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.useDefaultRenderLoop = isActive;
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: cameraLocked ? "none" : "auto" }}
    />
  );
}
