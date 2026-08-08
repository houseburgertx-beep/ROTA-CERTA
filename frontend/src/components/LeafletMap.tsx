import React, { useMemo, useRef } from "react";
import { View, StyleSheet, Platform, Text } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "@/src/theme/theme";

export type MapMarker = {
  lat: number;
  lng: number;
  label: string;
  color?: string;
  sub?: string;
};

type Props = {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  style?: any;
};

function buildHtml(markers: MapMarker[], center?: { lat: number; lng: number }): string {
  const c = center || (markers[0] ? { lat: markers[0].lat, lng: markers[0].lng } : { lat: -23.55, lng: -46.63 });
  const markersJson = JSON.stringify(markers.filter((m) => m.lat && m.lng));
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{height:100%;margin:0;background:#0B0E11;}
.pin{background:#FF6B00;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;}
.pin b{transform:rotate(45deg);color:#fff;font:bold 12px sans-serif;}</style>
</head><body><div id="map"></div>
<script>
var map = L.map('map',{zoomControl:true, attributionControl:false}).setView([${c.lat}, ${c.lng}], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19}).addTo(map);
var layer = L.layerGroup().addTo(map);
function draw(markers){
  layer.clearLayers();
  var bounds = [];
  markers.forEach(function(m){
    var color = m.color || '#FF6B00';
    var html = '<div class="pin" style="background:'+color+'"><b>'+(m.label||'')+'</b></div>';
    var icon = L.divIcon({className:'', html:html, iconSize:[26,26], iconAnchor:[13,26]});
    var mk = L.marker([m.lat,m.lng],{icon:icon}).addTo(layer);
    if(m.sub){ mk.bindPopup('<b>'+m.label+'</b><br/>'+m.sub); }
    bounds.push([m.lat,m.lng]);
  });
  if(bounds.length>1){ map.fitBounds(bounds,{padding:[40,40]}); }
  else if(bounds.length===1){ map.setView(bounds[0],14); }
}
function updateMarkers(markers){ draw(markers); }
draw(${markersJson});
</script></body></html>`;
}

export default function LeafletMap({ markers, center, style }: Props) {
  const ref = useRef<WebView>(null);
  const html = useMemo(() => buildHtml(markers, center), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update markers without reloading the whole page.
  React.useEffect(() => {
    if (Platform.OS === "web") return;
    const valid = markers.filter((m) => m.lat && m.lng);
    ref.current?.injectJavaScript(`updateMarkers(${JSON.stringify(valid)}); true;`);
  }, [markers]);

  if (Platform.OS === "web") {
    return (
      <View style={[styles.web, style]}>
        <Text style={styles.webText}>
          Mapa disponível no app (Expo Go / celular).{"\n"}
          {markers.length} ponto(s) no mapa.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={ref}
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden", backgroundColor: colors.bg },
  webview: { flex: 1, backgroundColor: colors.bg },
  web: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    padding: 24,
  },
  webText: { color: colors.textMuted, textAlign: "center", lineHeight: 22 },
});
