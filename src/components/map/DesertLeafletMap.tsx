import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  DesertFieldPreset,
  GeoCoord,
  RfLinkAnalysis,
} from '@/src/lib/geodesic/rf';

export interface DecodedMapPin {
  id: string;
  lat: number;
  lon: number;
  label: string;
  timestamp: number;
}

interface DesertLeafletMapProps {
  preset: DesertFieldPreset;
  medicCoord: GeoCoord;
  truckCoord: GeoCoord;
  rfLink: RfLinkAnalysis;
  repeaterEnabled: boolean;
  roadWashedOut: boolean;
  decodedPins: DecodedMapPin[];
  onMedicDrag?: (coord: GeoCoord) => void;
  compact?: boolean;
  heightClass?: string;
}

function makeDivIcon(
  label: string,
  accentHex: string,
  shape: 'square' | 'diamond' | 'circle' = 'square',
  anchorY = 10
) {
  const radius = shape === 'circle' ? '9999px' : '0px';
  const rot = shape === 'diamond' ? 'transform: rotate(45deg);' : '';
  return L.divIcon({
    className: 'screech-leaflet-marker',
    html: `<div style="display:flex;align-items:center;gap:6px;white-space:nowrap;">
      <span style="width:12px;height:12px;background:${accentHex};border:2px solid #FFFFFF;border-radius:${radius};${rot}display:inline-block;flex-shrink:0;"></span>
      <span style="background:rgba(20,20,19,0.9);color:#F6F5F0;padding:1px 5px;font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.03em;border:1px solid rgba(255,255,255,0.2);">${label}</span>
    </div>`,
    iconSize: [140, 20],
    iconAnchor: [6, anchorY],
  });
}

export const DesertLeafletMap: React.FC<DesertLeafletMapProps> = ({
  preset,
  medicCoord,
  truckCoord,
  rfLink,
  repeaterEnabled,
  roadWashedOut,
  decodedPins,
  onMedicDrag,
  compact = false,
  heightClass = 'h-[480px]',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);
  const onMedicDragRef = useRef(onMedicDrag);
  onMedicDragRef.current = onMedicDrag;
  const lastPresetIdRef = useRef<string>('');

  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;

    const map = L.map(el, {
      center: [preset.clinic.lat, preset.clinic.lon],
      zoom: compact ? 10 : 11,
      zoomControl: !compact,
      attributionControl: !compact,
    });

    // Primary OpenTopoMap with clean Carto Voyager fallback on tile error
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'Map data: OSM / SRTM | OpenTopoMap',
    });
    topoLayer.addTo(map);

    const layers = L.layerGroup().addTo(map);
    mapRef.current = map;
    layersRef.current = layers;

    // Ensure proper Leaflet sizing after initial paint
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      layersRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    // 1. Topographic reference grid lines around sector (guarantees technical precision even offline)
    const centerLat = (preset.clinic.lat + preset.townPost.lat) / 2;
    const centerLon = (preset.clinic.lon + preset.townPost.lon) / 2;
    for (let d = -0.35; d <= 0.35; d += 0.07) {
      L.polyline(
        [
          [centerLat + d, centerLon - 0.45],
          [centerLat + d, centerLon + 0.45],
        ],
        { color: '#6E6D68', weight: 0.6, opacity: 0.28, dashArray: '2 4' }
      ).addTo(layers);
      L.polyline(
        [
          [centerLat - 0.35, centerLon + d],
          [centerLat + 0.35, centerLon + d],
        ],
        { color: '#6E6D68', weight: 0.6, opacity: 0.28, dashArray: '2 4' }
      ).addTo(layers);
    }

    // 2. Canyon Ridge Obstacle Contour Zone
    L.circle([preset.canyonRidgeCenter.lat, preset.canyonRidgeCenter.lon], {
      radius: preset.canyonRidgeRadiusKm * 1000,
      color: '#D97706',
      weight: 1.5,
      dashArray: '5 4',
      fillColor: '#D97706',
      fillOpacity: 0.1,
    })
      .bindPopup(
        `<strong>CANYON RIDGE OBSTACLE</strong><br/>Peak: ${preset.canyonHeightM}m ASL<br/>Radius: ${preset.canyonRidgeRadiusKm} km`
      )
      .addTo(layers);

    // 3. Supply Truck Desert Route Polyline
    const routeLatLngs = preset.waypoints.map((w) => [w.lat, w.lon] as [number, number]);
    L.polyline(routeLatLngs, {
      color: roadWashedOut ? '#C81E1E' : '#141413',
      weight: 2.5,
      dashArray: roadWashedOut ? '6 6' : '8 4',
      opacity: 0.85,
    }).addTo(layers);

    // 4. RF Line-of-Sight Vector (Medic -> Town Post or via Repeater)
    const rfColor =
      rfLink.linkQuality === 'CLEAR'
        ? '#008A52'
        : rfLink.linkQuality === 'DEGRADED'
        ? '#D97706'
        : '#C81E1E';

    if (rfLink.viaRepeater && repeaterEnabled) {
      L.polyline(
        [
          [medicCoord.lat, medicCoord.lon],
          [preset.repeater.lat, preset.repeater.lon],
          [preset.townPost.lat, preset.townPost.lon],
        ],
        {
          color: rfColor,
          weight: 2.5,
          opacity: 0.9,
        }
      ).addTo(layers);
    } else {
      L.polyline(
        [
          [medicCoord.lat, medicCoord.lon],
          [preset.townPost.lat, preset.townPost.lon],
        ],
        {
          color: rfColor,
          weight: 2.5,
          dashArray: rfLink.obstructed ? '4 6' : undefined,
          opacity: 0.9,
        }
      ).addTo(layers);
    }

    // 5. Stationary Nodes
    L.marker([preset.clinic.lat, preset.clinic.lon], {
      icon: makeDivIcon('CLINIC_01 [PI ZERO]', '#141413', 'square'),
    })
      .bindPopup(
        `<strong>CLINIC_01</strong><br/>${preset.clinic.lat.toFixed(4)}° N, ${preset.clinic.lon.toFixed(4)}° E<br/>1.0W Pi Zero + Fridge Probe`
      )
      .addTo(layers);

    L.marker([preset.townPost.lat, preset.townPost.lon], {
      icon: makeDivIcon('RANGER POST [RX]', '#008A52', 'square'),
    })
      .bindPopup(
        `<strong>TOWN RANGER POST</strong><br/>${preset.townPost.lat.toFixed(4)}° N, ${preset.townPost.lon.toFixed(4)}° E<br/>$30 Android TRRS Kiosk`
      )
      .addTo(layers);

    if (!compact) {
      L.marker([preset.hospital.lat, preset.hospital.lon], {
        icon: makeDivIcon('CITY HOSPITAL', '#141413', 'square', 24),
      })
        .bindPopup(
          `<strong>CITY HOSPITAL SERVER</strong><br/>${preset.hospital.lat.toFixed(4)}° N, ${preset.hospital.lon.toFixed(4)}° E`
        )
        .addTo(layers);

      L.marker([preset.repeater.lat, preset.repeater.lon], {
        icon: makeDivIcon(
          repeaterEnabled ? 'VHF REPEATER [ON]' : 'VHF REPEATER [OFF]',
          repeaterEnabled ? '#008A52' : '#6E6D68',
          'diamond'
        ),
      })
        .bindPopup(
          `<strong>HILLTOP VHF REPEATER</strong><br/>Elev: ${preset.repeater.elevationM}m ASL<br/>Status: ${repeaterEnabled ? 'ACTIVE' : 'OFFLINE'}`
        )
        .addTo(layers);

      L.marker([truckCoord.lat, truckCoord.lon], {
        icon: makeDivIcon(
          roadWashedOut ? 'TRUCK [HALTED]' : 'TRUCK [ESP32 MULE]',
          roadWashedOut ? '#C81E1E' : '#D97706',
          'circle'
        ),
      })
        .bindPopup(
          `<strong>SUPPLY TRUCK MULE</strong><br/>${truckCoord.lat.toFixed(4)}° N, ${truckCoord.lon.toFixed(4)}° E`
        )
        .addTo(layers);
    }

    // 6. Draggable Mobile Medic 01 Pin
    const medicMarker = L.marker([medicCoord.lat, medicCoord.lon], {
      draggable: !compact && Boolean(onMedicDragRef.current),
      icon: makeDivIcon('MEDIC_01 [TX]', '#FF4400', 'circle'),
    });
    medicMarker.bindPopup(
      `<strong>MOBILE MEDIC 01</strong><br/>${medicCoord.lat.toFixed(4)}° N, ${medicCoord.lon.toFixed(4)}° E<br/>Drag pin to test terrain LOS`
    );
    if (!compact && onMedicDragRef.current) {
      medicMarker.on('dragend', () => {
        const ll = medicMarker.getLatLng();
        onMedicDragRef.current?.({
          lat: Number(ll.lat.toFixed(5)),
          lon: Number(ll.lng.toFixed(5)),
          elevationM: medicCoord.elevationM ?? 190,
        });
      });
    }
    medicMarker.addTo(layers);

    // 7. Decoded Valid SOS Pins (only plotted after CRC-16 passes!)
    for (const pin of decodedPins) {
      L.circleMarker([pin.lat, pin.lon], {
        radius: 8,
        color: '#FF4400',
        weight: 2,
        fillColor: '#FF4400',
        fillOpacity: 0.35,
      })
        .bindPopup(
          `<strong>VERIFIED RX SOS</strong><br/>${pin.label}<br/>${pin.lat.toFixed(4)}°, ${pin.lon.toFixed(4)}°`
        )
        .addTo(layers);
    }

    // Fit map bounds when desert sector preset changes
    if (lastPresetIdRef.current !== preset.id) {
      lastPresetIdRef.current = preset.id;
      const bounds = L.latLngBounds([
        [preset.clinic.lat, preset.clinic.lon],
        [preset.townPost.lat, preset.townPost.lon],
        [medicCoord.lat, medicCoord.lon],
        [preset.canyonRidgeCenter.lat, preset.canyonRidgeCenter.lon],
      ]);
      map.fitBounds(bounds.pad(0.24));
    }
  }, [preset, medicCoord, truckCoord, rfLink, repeaterEnabled, roadWashedOut, decodedPins, compact]);

  return (
    <div
      ref={containerRef}
      data-testid={compact ? 'kiosk-mini-map' : 'desert-main-map'}
      className={`w-full ${heightClass} relative z-0 bg-[#EAE8E1] dark:bg-[#161614]`}
    />
  );
};
