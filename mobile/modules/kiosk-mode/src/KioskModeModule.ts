import { NativeModule, requireNativeModule } from 'expo';

declare class KioskModeModule extends NativeModule<{}> {
  startKioskMode(): void;
  stopKioskMode(): void;
  isInKioskMode(): boolean;
}

export default requireNativeModule<KioskModeModule>('KioskMode');