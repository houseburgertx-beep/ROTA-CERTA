import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { api } from "@/src/config/api";

export type PermState = "granted" | "denied" | "blocked" | "undetermined";

export function useLocationSharing() {
  const [sharing, setSharing] = useState(false);
  const [perm, setPerm] = useState<PermState>("undetermined");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);

  const stop = useCallback(() => {
    sub.current?.remove();
    sub.current = null;
    setSharing(false);
  }, []);

  const start = useCallback(async () => {
    const cur = await Location.getForegroundPermissionsAsync();
    let status = cur.status;
    if (status !== "granted") {
      if (!cur.canAskAgain) {
        setPerm("blocked");
        return false;
      }
      const req = await Location.requestForegroundPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        setPerm(req.canAskAgain ? "denied" : "blocked");
        return false;
      }
    }
    setPerm("granted");
    // initial fix
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      api.post("/location", c).catch(() => {});
    } catch {}
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 10000, distanceInterval: 30 },
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        api.post("/location", c).catch(() => {});
      }
    );
    setSharing(true);
    return true;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { sharing, perm, coords, start, stop };
}
