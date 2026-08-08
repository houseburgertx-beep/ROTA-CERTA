import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { api } from "@/src/config/api";
import { useLocationSharing } from "@/src/hooks/use-location-sharing";
import LeafletMap, { MapMarker } from "@/src/components/LeafletMap";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function DriverMap() {
  const insets = useSafeAreaInsets();
  const { sharing, coords, start } = useLocationSharing();
  const [markers, setMarkers] = useState<MapMarker[]>([]);

  const load = useCallback(async () => {
    try {
      const deliveries = await api.get("/deliveries");
      const m: MapMarker[] = (deliveries || [])
        .filter((d: any) => d.lat && d.lng && d.status !== "entregue")
        .map((d: any) => ({ lat: d.lat, lng: d.lng, label: String(d.sequence || "•"), color: colors.primary, sub: `${d.customer_name} — ${d.address}` }));
      setMarkers(m);
    } catch {}
  }, []);

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const all = coords
    ? [{ lat: coords.lat, lng: coords.lng, label: "•", color: colors.em_rota, sub: "Você" }, ...markers]
    : markers;

  return (
    <View style={styles.container}>
      <LeafletMap markers={all} center={coords || undefined} />
      <View style={[styles.badge, { top: insets.top + 8 }]}>
        <View style={[styles.dot, { backgroundColor: sharing ? colors.entregue : colors.textDim }]} />
        <Text style={styles.badgeText}>{markers.length} entrega(s) no mapa</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  badge: {
    position: "absolute",
    alignSelf: "center",
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
  dot: { width: 8, height: 8, borderRadius: 4 },
  badgeText: { color: colors.text, fontSize: font.small, fontWeight: "700" },
});
