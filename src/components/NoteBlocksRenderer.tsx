import { View, Text, StyleSheet } from 'react-native';
import { NoteBlock } from '../types/note';

type Props = {
  blocks: NoteBlock[];
  collapsed?: boolean; // if true, render a plain 2-line preview (for list rows)
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
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  quoteBlock: {
    borderLeftWidth: 3,
    borderLeftColor: '#E53935',
    paddingLeft: 12,
    gap: 4,
  },
  quoteText: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#444',
    lineHeight: 22,
  },
  quoteLocation: {
    fontSize: 12,
    color: '#AAA',
  },
});
