import { useEffect, useState } from "react";
import { getDeviceConfig, DeviceConfig } from "@/lib/deviceConfig";

export function useDeviceConfig(): DeviceConfig | null {
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  useEffect(() => {
    getDeviceConfig().then(setConfig);
  }, []);
  return config;
}
