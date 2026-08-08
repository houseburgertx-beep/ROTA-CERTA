import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/config/api";
import LeafletMap, { MapMarker } from "@/src/components/LeafletMap";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function Mapa() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [driverCount, setDriverCount] = useState(0);
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const [locs, deliveries] = await Promise.all([
        api.get("/drivers/locations"),
        api.get("/deliveries?status_filter=em_rota"),
      ]);
      const dMarkers: MapMarker[] = (locs || [])
        .filter((d: any) => d.lat && d.lng)
        .map((d: any) => ({ lat: d.lat, lng: d.lng, label: d.name.charAt(0).toUpperCase(), color: colors.em_rota, sub: `Motoboy: ${d.name}` }));
      const delMarkers: MapMarker[] = (deliveries || [])
        .filter((d: any) => d.lat && d.lng)
        .map((d: any) => ({ lat: d.lat, lng: d.lng, label: "•", color: colors.primary, sub: `${d.customer_name} — ${d.address}` }));
      setDriverCount(dMarkers.length);
      setMarkers([...dMarkers, ...delMarkers]);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, 8000);
    return () => clearInterval(timer.current);
  }, [load]);

  return (
    <View style={styles.container}>
      <LeafletMap markers={markers} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.back} onPress={() => router.back()} testID="map-back">
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.badge}>
          <View style={styles.liveDot} />
          <Text style={styles.badgeText}>{driverCount} motoboy(s) ao vivo</Text>
        </View>
        <Pressable style={styles.back} onPress={load} testID="map-refresh">
          <Ionicons name="refresh" size={20} color={colors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  back: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    height: 40,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.entregue },
  badgeText: { color: colors.text, fontSize: font.small, fontWeight: "700" },
});
