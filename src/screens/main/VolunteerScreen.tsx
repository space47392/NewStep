import { View, Text, StyleSheet } from 'react-native';

export default function VolunteerScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Volunteer</Text>
      <Text style={styles.subtitle}>Earn points by helping other students</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A73E8',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
});
