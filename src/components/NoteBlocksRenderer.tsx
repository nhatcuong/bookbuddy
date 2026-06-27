import { View, Text, StyleSheet } from 'react-native';
import { NoteBlock } from '../types/note';
import { ACCENT, BODY, INK, FAINT } from '../tokens';

type Props = {
  blocks: NoteBlock[];
  collapsed?: boolean;
};

export default function NoteBlocksRenderer({ blocks, collapsed = false }: Props) {
  if (collapsed) {
    const preview = blocks.map(b => b.text).join(' ');
    return (
      <Text style={styles.thought} numberOfLines={2}>
        {preview}
      </Text>
    );
  }

  return (
    <View style={styles.container}>
      {blocks.map((block, i) => {
        if (block.type === 'quote') {
          return (
            <View key={i} style={styles.quoteBlock}>
              <Text style={styles.quoteText}>{block.text}</Text>
              {block.location && (
                <Text style={styles.quoteLocation}>{block.location}</Text>
              )}
            </View>
          );
        }
        return (
          <Text key={i} style={styles.thought}>
            {block.text}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  thought: {
    fontSize: 15.5,
    color: BODY,
    lineHeight: 25,
  },
  quoteBlock: {
    borderLeftWidth: 2.5,
    borderLeftColor: ACCENT,
    paddingLeft: 15,
    gap: 5,
  },
  quoteText: {
    fontFamily: 'Newsreader_400Regular_Italic',
    fontSize: 16,
    color: INK,
    lineHeight: 25,
  },
  quoteLocation: {
    fontSize: 11.5,
    color: FAINT,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
