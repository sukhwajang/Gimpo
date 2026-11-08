import type { StyleSpecification } from 'maplibre-gl';
import boundaries from '../data/generated/boundaries.json';
import type { BasemapId } from '../state/store';

export interface BasemapInfo {
  id: BasemapId;
  label: string;
  needsKey?: boolean;
  dark: boolean;
}

export const BASEMAPS: BasemapInfo[] = [
  { id: 'carto-dark', label: '어두운 지도 (CARTO)', dark: true },
  { id: 'carto-light', label: '밝은 지도 (CARTO)', dark: false },
  { id: 'osm-3d', label: '3D 건물 지도 (OpenFreeMap)', dark: false },
  { id: 'vworld-midnight', label: '브이월드 야간', needsKey: true, dark: true },
  { id: 'vworld-base', label: '브이월드 기본', needsKey: true, dark: false },
  { id: 'vworld-satellite', label: '브이월드 항공사진', needsKey: true, dark: true },
  { id: 'offline', label: '오프라인 (행정경계만)', dark: true },
];

export function offlineStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      boundaries: { type: 'geojson', data: boundaries as GeoJSON.FeatureCollection },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0e1320' } },
      { id: 'b-fill', type: 'fill', source: 'boundaries', paint: { 'fill-color': '#161d2e', 'fill-opacity': 0.9 } },
      { id: 'b-line', type: 'line', source: 'boundaries', paint: { 'line-color': '#34405c', 'line-width': 1 } },
    ],
  };
}

function rasterStyle(tiles: string, attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [tiles], tileSize: 256, attribution, maxzoom },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0e1320' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  };
}

export function basemapStyle(id: BasemapId, vworldKey: string): string | StyleSpecification {
  const vw = (layer: string, ext: string) =>
    rasterStyle(`https://api.vworld.kr/req/wmts/1.0.0/${encodeURIComponent(vworldKey)}/${layer}/{z}/{y}/{x}.${ext}`, '© 브이월드(국토교통부)');
  switch (id) {
    case 'carto-dark':
      return 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
    case 'carto-light':
      return 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
    case 'osm-3d':
      return 'https://tiles.openfreemap.org/styles/liberty';
    case 'vworld-base':
      return vworldKey ? vw('Base', 'png') : offlineStyle();
    case 'vworld-midnight':
      return vworldKey ? vw('midnight', 'png') : offlineStyle();
    case 'vworld-satellite':
      return vworldKey ? vw('Satellite', 'jpeg') : offlineStyle();
    default:
      return offlineStyle();
  }
}

export const BOUNDARIES = boundaries as GeoJSON.FeatureCollection;
