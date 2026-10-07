import { Linking, StyleProp, Text, TextStyle } from 'react-native';

// Web links (https://…, www.…) inside a chat message become tappable.
const LINK = /((?:https?:\/\/|www\.)[^\s<>"']+[^\s<>"'.,!?;:)\]])/gi;

type Props = {
  children: string;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
};

export default function LinkifiedText({ children, style, linkStyle }: Props) {
  const parts = children.split(LINK);
  if (parts.length === 1) return <Text style={style}>{children}</Text>;
  return (
    <Text style={style}>
      {parts.map((part, i) =>
        // split() with a capture group puts every match at an odd index.
        i % 2 === 1 ? (
          <Text
            key={i}
            style={[{ textDecorationLine: 'underline' }, linkStyle]}
            accessibilityRole="link"
            onPress={() => Linking.openURL(/^https?:\/\//i.test(part) ? part : `https://${part}`).catch(() => {})}
          >
            {part}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}
