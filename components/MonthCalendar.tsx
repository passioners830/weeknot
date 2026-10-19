import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WEEKDAY_LABELS, buildMonthGrid, monthDayKey } from '../lib/calendar';

type Props = {
  year: number;
  month: number;
  markedDays: Record<string, number>;
  selectedDay: string | null;
  todayKey: string;
  loading: boolean;
  onSelectDay: (dayKey: string) => void;
  onChangeMonth: (delta: -1 | 1) => void;
};

export default function MonthCalendar({
  year,
  month,
  markedDays,
  selectedDay,
  todayKey,
  loading,
  onSelectDay,
  onChangeMonth,
}: Props) {
  const weeks = buildMonthGrid(year, month);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => onChangeMonth(-1)}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          accessibilityLabel="前の月"
        >
          <Text style={styles.arrow}>◀</Text>
        </TouchableOpacity>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {year}年{month + 1}月
          </Text>
          {loading && <ActivityIndicator size="small" style={styles.spinner} />}
        </View>
        <TouchableOpacity
          onPress={() => onChangeMonth(1)}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          accessibilityLabel="次の月"
        >
          <Text style={styles.arrow}>▶</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        {WEEKDAY_LABELS.map((label, i) => (
          <View key={label} style={styles.cell}>
            <Text style={[styles.weekday, i === 0 && styles.sunday, i === 6 && styles.saturday]}>
              {label}
            </Text>
          </View>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.row}>
          {week.map((day, i) => {
            if (day === null) return <View key={i} style={styles.cell} />;
            const key = monthDayKey(year, month, day);
            const count = markedDays[key] ?? 0;
            const selected = key === selectedDay;
            const today = key === todayKey;
            return (
              <TouchableOpacity
                key={i}
                style={styles.cell}
                onPress={() => onSelectDay(key)}
                accessibilityLabel={`${month + 1}月${day}日${count > 0 ? `、投稿${count}件` : ''}`}
              >
                <View
                  style={[styles.dayCircle, today && styles.dayCircleToday, selected && styles.dayCircleSelected]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      i === 0 && styles.sunday,
                      i === 6 && styles.saturday,
                      selected && styles.dayTextSelected,
                    ]}
                  >
                    {day}
                  </Text>
                </View>
                <View style={[styles.dot, count > 0 && styles.dotMarked]} />
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600' },
  spinner: { marginLeft: 8 },
  arrow: { fontSize: 14, color: '#666' },
  row: { flexDirection: 'row' },
  cell: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' },
  weekday: { fontSize: 11, color: '#999' },
  sunday: { color: '#e74c3c' },
  saturday: { color: '#3b82c4' },
  dayCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: { borderWidth: 1, borderColor: '#333' },
  dayCircleSelected: { backgroundColor: '#333', borderWidth: 0 },
  dayText: { fontSize: 14, color: '#333' },
  dayTextSelected: { color: '#fff', fontWeight: '600' },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  dotMarked: { backgroundColor: '#e8577a' },
});
