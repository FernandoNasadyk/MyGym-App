import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '../constants/app-theme';

/** Barra de progreso animada (0 a 1). */
export default function ProgressBar({ progress = 0, height = 8 }) {
  const [width, setWidth] = useState(0);
  const animation = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, progress));

  useEffect(() => {
    Animated.timing(animation, {
      toValue: clamped,
      duration: 320,
      useNativeDriver: false,
    }).start();
  }, [animation, clamped]);

  const animatedWidth = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, width || 1],
  });

  return (
    <View
      style={[styles.track, { height, borderRadius: height / 2 }]}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: animatedWidth, borderRadius: height / 2 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.surfaceHigh,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.primary,
  },
});
