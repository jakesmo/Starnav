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
  Entity,
  CallbackProperty,
  HeadingPitchRoll,
  Transforms,
  HeadingPitchRange,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import type { AttitudeStore } from "../../hooks/useAttitude";
import { smooth } from "../../hooks/useAttitude";
import type { SatPosition } from "../../hooks/useSatellites";
import SatelliteLayer from "./SatelliteLayer";

export type CameraMode = "first-person" | "third-person" | "free-look";

Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzZWRjMWYxOS0xZDExLTQyYWQtYjA5OS05ZjFjNzIyMjRjZGMiLCJpZCI6NDExNDM0LCJpYXQiOjE3NzQ4OTM0NDR9.cZWL8MxEOKxh7Pn9iG2THLaZG5Dk1E4tWlyC11iI-5U";

interface CesiumSceneProps {
  attitudeStore: React.RefObject<AttitudeStore | null>;
  isActive: boolean;
  cameraMode: CameraMode;
  satellites: SatPosition[];
}

export default function CesiumScene({
  attitudeStore,
  isActive,
  cameraMode,
  satellites,
}: CesiumSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const tilesetRef = useRef<Cesium3DTileset | null>(null);
  const entityRef = useRef<Entity | null>(null);
  const userHeadingOffset = useRef(0);
  const userPitchOffset = useRef(0);
  const handlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const dragState = useRef<{
    startX: number; startY: number; startH: number; startP: number;
  } | null>(null);
  const cameraModeRef = useRef(cameraMode);
  cameraModeRef.current = cameraMode;

  // Shared mutable position/orientation for entity callbacks
  const currentPosition = useRef(Cartesian3.fromDegrees(0, 0, 0));
  const currentHPR = useRef(new HeadingPitchRoll(0, 0, 0));

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

    // Disable default camera controls initially
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
      tileset.maximumScreenSpaceError = 8;
      (tileset as any).maximumMemoryUsage = 256;
      tileset.preloadFlightDestinations = true;
      tilesetRef.current = tileset;
      tileset.tileFailed.addEventListener(() => {
        tileset.trimLoadedTiles();
      });
    });

    // Aircraft 3D model entity (visible in third-person only)
    const posCallback = new CallbackProperty(() => currentPosition.current, false);
    const oriCallback = new CallbackProperty(() => {
      return Transforms.headingPitchRollQuaternion(
        currentPosition.current,
        currentHPR.current,
      );
    }, false);

    const entity = viewer.entities.add({
      position: posCallback as any,
      orientation: oriCallback as any,
      model: {
        uri: "/models/aircraft.glb",
        minimumPixelSize: 64,
        maximumScale: 1.0,
        show: false, // toggled by camera mode
      },
    });
    entityRef.current = entity;

    // Camera update — runs INSIDE Cesium's render loop
    viewer.scene.preRender.addEventListener(() => {
      const store = attitudeStore.current;
      if (!store) return;

      const s = smooth(store);
      if (s.lat === 0 && s.lon === 0) return;

      const position = Cartesian3.fromDegrees(s.lon, s.lat, s.alt);
      const heading = CesiumMath.toRadians(s.yaw);
      const pitchRad = CesiumMath.toRadians(s.pitch);
      const rollRad = CesiumMath.toRadians(s.roll);

      // Update shared refs for entity callbacks
      currentPosition.current = position;
      currentHPR.current = new HeadingPitchRoll(heading, pitchRad, rollRad);

      const mode = cameraModeRef.current;

      if (mode === "first-person") {
        viewer.camera.setView({
          destination: position,
          orientation: { heading, pitch: pitchRad, roll: rollRad },
        });
      } else if (mode === "free-look") {
        const h = heading + CesiumMath.toRadians(userHeadingOffset.current);
        const p = pitchRad + CesiumMath.toRadians(userPitchOffset.current);
        viewer.camera.setView({
          destination: position,
          orientation: { heading: h, pitch: p, roll: rollRad },
        });
      }
      // third-person: Cesium's trackedEntity handles camera
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
      entityRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Camera mode changes
  useEffect(() => {
    const viewer = viewerRef.current;
    const entity = entityRef.current;
    if (!viewer || !entity) return;

    const ctrl = viewer.scene.screenSpaceCameraController;

    if (cameraMode === "third-person") {
      // Show model, enable orbit/zoom, track entity
      if (entity.model) entity.model.show = new CallbackProperty(() => true, true) as any;
      ctrl.enableRotate = true;
      ctrl.enableZoom = true;
      ctrl.enableTilt = true;
      viewer.trackedEntity = entity;
      viewer.flyTo(entity, {
        offset: new HeadingPitchRange(0, CesiumMath.toRadians(-30), 100),
        duration: 0.5,
      });

      // Clean up free-look handler if any
      if (handlerRef.current) {
        handlerRef.current.destroy();
        handlerRef.current = null;
      }
      userHeadingOffset.current = 0;
      userPitchOffset.current = 0;
    } else {
      // Hide model, disable orbit, untrack
      if (entity.model) entity.model.show = new CallbackProperty(() => false, true) as any;
      ctrl.enableRotate = false;
      ctrl.enableZoom = false;
      ctrl.enableTilt = false;
      ctrl.enableTranslate = false;
      ctrl.enableLook = false;
      viewer.trackedEntity = undefined;

      if (cameraMode === "free-look") {
        // Set up mouse handlers for free-look
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
        // first-person: clean up any handlers
        if (handlerRef.current) {
          handlerRef.current.destroy();
          handlerRef.current = null;
        }
        userHeadingOffset.current = 0;
        userPitchOffset.current = 0;
      }
    }
  }, [cameraMode]);

  // Suspend/resume rendering
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.useDefaultRenderLoop = isActive;
    if (isActive && tilesetRef.current) {
      tilesetRef.current.trimLoadedTiles();
    }
  }, [isActive]);

  const allowPointerEvents = cameraMode !== "first-person";

  // Get latest smoothed position for satellite layer
  const store = attitudeStore.current;
  const acPos = store
    ? { lat: store.smoothed.lat, lon: store.smoothed.lon, alt: store.smoothed.alt }
    : { lat: 0, lon: 0, alt: 0 };

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ pointerEvents: allowPointerEvents ? "auto" : "none" }}
      />
      <SatelliteLayer
        viewer={viewerRef.current}
        satellites={satellites}
        aircraftPosition={acPos}
        cameraMode={cameraMode}
      />
    </>
  );
}
