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
  Cesium3DTileset,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AttitudeStore } from "../../hooks/useAttitude";
import { smooth } from "../../hooks/useAttitude";

Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZWRjMWYxOS0xZDExLTQyYWQtYjA5OS05ZjFjNzIyMjRjZGMiLCJpZCI6NDExNDM0LCJpYXQiOjE3NzQ4OTM0NDR9.cZWL8MxEOKxh7Pn9iG2THLaZG5Dk1E4tWlyC11iI-5U";

interface CesiumSceneProps {
  attitudeStore: React.RefObject<AttitudeStore | null>;
  isActive: boolean;
  cameraLocked: boolean;
}

export default function CesiumScene({
  attitudeStore,
  isActive,
  cameraLocked,
}: CesiumSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const userHeadingOffset = useRef(0);
  const userPitchOffset = useRef(0);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dragState = useRef<{
    startX: number; startY: number; startH: number; startP: number;
  } | null>(null);
  const cameraLockedRef = useRef(cameraLocked);
  cameraLockedRef.current = cameraLocked;

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
      creditContainer: document.createElement("div"),
    });

    // 120° FOV
    const frustum = viewer.camera.frustum as PerspectiveFrustum;
    frustum.fov = CesiumMath.toRadians(120);

    // Atmosphere
    viewer.scene.fog.enabled = true;
    viewer.scene.fog.density = 0.0003;
    viewer.scene.globe.enableLighting = true;

    // Disable default camera controls (we drive the camera)
    const ctrl = viewer.scene.screenSpaceCameraController;
    ctrl.enableRotate = false;
    ctrl.enableTranslate = false;
    ctrl.enableZoom = false;
    ctrl.enableTilt = false;
    ctrl.enableLook = false;

    // Load Google 3D Tiles
    createGooglePhotorealistic3DTileset().then((tileset) => {
      viewer.scene.primitives.add(tileset);
      viewer.scene.globe.show = false;
      // Tune for stable tile loading
      tileset.maximumScreenSpaceError = 8;
      (tileset as any).maximumMemoryUsage = 256;
      tileset.preloadFlightDestinations = true;
      tilesetRef.current = tileset;

      // Retry failed tiles
      tileset.tileFailed.addEventListener(() => {
        tileset.trimLoadedTiles();
      });
    });

    // Camera update — runs INSIDE Cesium's render loop (no frame tearing)
    viewer.scene.preRender.addEventListener(() => {
      const store = attitudeStore.current;
      if (!store) return;

      const s = smooth(store);
      if (s.lat === 0 && s.lon === 0) return;

      const position = Cartesian3.fromDegrees(s.lon, s.lat, s.alt);

      let heading = CesiumMath.toRadians(s.yaw);
      let cameraPitch = CesiumMath.toRadians(s.pitch);
      const cameraRoll = CesiumMath.toRadians(s.roll);

      // Apply user offsets in free-look mode
      if (!cameraLockedRef.current) {
        heading += CesiumMath.toRadians(userHeadingOffset.current);
        cameraPitch += CesiumMath.toRadians(userPitchOffset.current);
      }

      viewer.camera.setView({
        destination: position,
        orientation: { heading, pitch: cameraPitch, roll: cameraRoll },
      });
    });

    viewerRef.current = viewer;

    return () => {
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      viewer.destroy();
      viewerRef.current = null;
      tilesetRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle free-look mouse drag
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    if (!cameraLocked) {
      const handler = new ScreenSpaceEventHandler(
        viewer.scene.canvas as HTMLCanvasElement,
      );

      handler.setInputAction(
        (movement: { position: { x: number; y: number } }) => {
          dragState.current = {
            startX: movement.position.x,
            startY: movement.position.y,
            startH: userHeadingOffset.current,
            startP: userPitchOffset.current,
          };
        },
        ScreenSpaceEventType.LEFT_DOWN,
      );

      handler.setInputAction(
        (movement: { endPosition: { x: number; y: number } }) => {
          if (!dragState.current) return;
          const dx = movement.endPosition.x - dragState.current.startX;
          const dy = movement.endPosition.y - dragState.current.startY;
          userHeadingOffset.current = dragState.current.startH + dx * 0.3;
          userPitchOffset.current = Math.max(
            -80,
            Math.min(80, dragState.current.startP - dy * 0.3),
          );
        },
        ScreenSpaceEventType.MOUSE_MOVE,
      );

      handler.setInputAction(() => {
        dragState.current = null;
      }, ScreenSpaceEventType.LEFT_UP);

      handlerRef.current = handler;
    } else {
      userHeadingOffset.current = 0;
      userPitchOffset.current = 0;
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
    }
  }, [cameraLocked]);

  // Suspend/resume rendering
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.useDefaultRenderLoop = isActive;
    // Force tile re-evaluation on resume
    if (isActive && tilesetRef.current) {
      tilesetRef.current.trimLoadedTiles();
    }
  }, [isActive]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ pointerEvents: cameraLocked ? "none" : "auto" }}
    />
  );
}
