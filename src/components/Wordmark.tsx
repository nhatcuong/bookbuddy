import { View, Text, StyleSheet } from 'react-native';
import { BODY, ACCENT } from '../tokens';

type Props = {
  size?: number;
};

export default function Wordmark({ size = 28 }: Props) {
  const dotSize = size * 0.38;

  return (
    <View style={styles.row}>
      <Text style={[styles.text, { fontSize: size }]}>Synt</Text>
      <View
        style={[
          styles.dot,
          {
            width: dotSize,
            height: dotSize,
            borderRadius: dotSize / 2,
            marginBottom: size * 0.255,
          },
        ]}
      />
      <Text style={[styles.text, { fontSize: size }]}>pico</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  text: {
    fontFamily: 'Bellefair_400Regular',
    color: BODY,
    letterSpacing: -0.2,
  },
  dot: {
    backgroundColor: ACCENT,
  },
});
