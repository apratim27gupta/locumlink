import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { BrowseJob, Job } from '@/types/api';

type JobLike = BrowseJob | Job;

function isBrowseJob(job: JobLike): job is BrowseJob {
  return (job as BrowseJob).hostProfile?.city != null;
}

function formatPay(pay: string | number | null | undefined): string | null {
  if (pay == null || pay === '') return null;
  const n = typeof pay === 'number' ? pay : Number(pay);
  if (!Number.isFinite(n)) return String(pay);
  return `$${n.toLocaleString()}/day`;
}

export function JobCard({ job, onPress }: { job: JobLike; onPress?: () => void }) {
  const pay = formatPay('payPerDay' in job ? job.payPerDay : null);
  const location = isBrowseJob(job)
    ? `${job.hostProfile.city}, ${job.hostProfile.province}`
    : job.location ?? null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} disabled={!onPress}>
      <Text style={styles.title}>{job.title}</Text>
      {location ? <Text style={styles.meta}>{location}</Text> : null}
      {pay ? <Text style={styles.pay}>{pay}</Text> : null}
      {'applicationsCount' in job ? (
        <Text style={styles.meta}>{job.applicationsCount} applicants</Text>
      ) : null}
      {'status' in job ? <Text style={styles.badge}>{job.status}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e5ee',
    padding: 14,
    marginBottom: 10,
  },
  title: { fontSize: 16, fontWeight: '600', color: '#0f1523', marginBottom: 4 },
  meta: { fontSize: 13, color: '#5a6478', marginBottom: 2 },
  pay: { fontSize: 14, fontWeight: '600', color: '#0F2A7A', marginTop: 4 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
