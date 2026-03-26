import 'react-native-gesture-handler';
import { Platform } from 'react-native';
import { registerRootComponent } from 'expo';

import App from './App';

if (Platform.OS === 'web') {
  const origWarn = console.warn.bind(console);
  const suppressed = [
    'useNativeDriver',
    'props.pointerEvents',
    'shadow*',
    'Listening to push token',
    'Animated:',
  ];
  console.warn = (...args: any[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (suppressed.some(s => msg.includes(s))) return;
    origWarn(...args);
  };
}

registerRootComponent(App);
