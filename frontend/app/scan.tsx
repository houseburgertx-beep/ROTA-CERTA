import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Linking, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/config/api";
import { Button } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function Scan() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState(false);

  async function pickFromCamera() {
    setError("");
    const perm = await ImagePicker.getCameraPermissionsAsync();
    let status = perm.status;
    if (status !== "granted") {
      if (!perm.canAskAgain) {
        setBlocked(true);
        setError("Permissão de câmera bloqueada. Abra as configurações para liberar.");
        return;
      }
      const req = await ImagePicker.requestCameraPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        setBlocked(!req.canAskAgain);
        setError("Precisamos da câmera para fotografar a comanda.");
        return;
      }
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
    });
    handleResult(res);
  }

  async function pickFromGallery() {
    setError("");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
    });
    handleResult(res);
  }

  async function handleResult(res: ImagePicker.ImagePickerResult) {
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const asset = res.assets[0];
    setPreview(asset.uri);
    setBusy(true);
    setError("");
    try {
      const data = await api.post("/deliveries/scan", {
        image_base64: asset.base64,
        mime_type: asset.mimeType || "image/jpeg",
      });
      router.replace({
        pathname: "/review",
        params: {
          customer_name: data.customer_name,
          address: data.address,
          payment_method: data.payment_method,
          order_value: String(data.order_value),
          delivery_fee: String(data.delivery_fee),
          notes: data.notes || "",
          address_incomplete: data.address_incomplete ? "1" : "0",
        },
      });
    } catch (e: any) {
      setError(e.message || "Não foi possível ler a comanda");
      setBusy(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} testID="scan-close">
          <Ionicons name="close" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Ler comanda</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.frame}>
          {preview ? (
            <Image source={{ uri: preview }} style={styles.previewImg} contentFit="cover" />
          ) : (
            <View style={styles.placeholder}>
              <Ionicons name="scan-outline" size={54} color={colors.textDim} />
              <Text style={styles.placeholderText}>
                Fotografe a comanda ou escolha da galeria.{"\n"}A IA extrai cliente, endereço, pagamento e valor.
              </Text>
            </View>
          )}
          {busy && (
            <View style={styles.overlay}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.overlayText}>Lendo comanda com IA…</Text>
            </View>
          )}
        </View>

        {error ? <Text style={styles.error} testID="scan-error">{error}</Text> : null}

        {blocked ? (
          <Button title="Abrir configurações" variant="secondary" icon="settings-outline" onPress={() => Linking.openSettings()} testID="scan-open-settings" />
        ) : (
          <>
            <Button title="Tirar foto" icon="camera" onPress={pickFromCamera} disabled={busy} testID="scan-camera-button" />
            <Button title="Escolher da galeria" variant="secondary" icon="images-outline" onPress={pickFromGallery} disabled={busy} style={{ marginTop: spacing.md }} testID="scan-gallery-button" />
          </>
        )}

        <Pressable style={styles.manual} onPress={() => router.replace("/review")} testID="scan-manual-button">
          <Text style={styles.manualText}>Ou preencher manualmente</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: { color: colors.text, fontSize: font.title, fontWeight: "800" },
  body: { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  frame: {
    flex: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: spacing.xl,
  },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xxl, gap: spacing.lg },
  placeholderText: { color: colors.textMuted, fontSize: font.body, textAlign: "center", lineHeight: 21 },
  previewImg: { flex: 1, width: "100%" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(11,14,17,0.82)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  overlayText: { color: colors.text, fontSize: font.body, fontWeight: "600" },
  error: { color: colors.problema, fontSize: font.small, marginBottom: spacing.md, textAlign: "center" },
  manual: { alignItems: "center", paddingVertical: spacing.lg },
  manualText: { color: colors.textMuted, fontSize: font.body, textDecorationLine: "underline" },
});
