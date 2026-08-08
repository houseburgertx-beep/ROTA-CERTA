import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { Button, Field } from "@/src/components/ui";
import { colors, spacing, font, radius } from "@/src/theme/theme";

export default function Login() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setError("");
    if (!email || !password) {
      setError("Preencha e-mail e senha");
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace("/");
    } catch (e: any) {
      setError(e.message || "Não foi possível entrar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <KeyboardAwareScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40 }]}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoWrap}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.logo}>
            <Ionicons name="navigate" size={30} color={colors.white} />
          </LinearGradient>
          <Text style={styles.brand}>Rota Certa</Text>
          <Text style={styles.tagline}>Gestão de entregas e motoboys</Text>
        </View>

        <View style={styles.form}>
          <Field
            label="E-mail"
            icon="mail-outline"
            placeholder="voce@empresa.com"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            testID="login-email-input"
          />
          <Field
            label="Senha"
            icon="lock-closed-outline"
            placeholder="••••••••"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            testID="login-password-input"
          />

          {error ? (
            <Text style={styles.error} testID="login-error">
              {error}
            </Text>
          ) : null}

          <Button title="Entrar" onPress={onSubmit} loading={loading} testID="login-submit-button" />

          <Pressable
            style={styles.linkRow}
            onPress={() => router.push("/register")}
            testID="go-register-link"
          >
            <Text style={styles.linkText}>
              É gestor?{" "}
              <Text style={styles.linkAccent}>Criar conta da empresa</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: spacing.xl, paddingBottom: 40 },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  logo: {
    width: 72,
    height: 72,
    borderRadius: radius.xl,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  brand: { color: colors.text, fontSize: font.h1, fontWeight: "900", letterSpacing: -0.5 },
  tagline: { color: colors.textMuted, fontSize: font.body, marginTop: spacing.xs },
  form: {},
  error: { color: colors.problema, fontSize: font.small, marginBottom: spacing.md, textAlign: "center" },
  linkRow: { marginTop: spacing.xl, alignItems: "center" },
  linkText: { color: colors.textMuted, fontSize: font.body },
  linkAccent: { color: colors.primary, fontWeight: "700" },
});
