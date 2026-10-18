/** Resource attributes shared by traces, logs, and metrics. */
export type ServiceResourceInput = {
  serviceName: string;
  environment: string;
  version: string;
  hostName: string;
  podName?: string;
  podNamespace?: string;
};

const GENERIC_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '::1',
]);

export function hostNameFrom(input: {
  hostname?: string;
  envHostname?: string;
  podName?: string;
}): string {
  const pod = clean(input.podName);
  if (pod) return pod;
  const fromEnv = usableHost(input.envHostname);
  if (fromEnv) return fromEnv;
  const fromOs = usableHost(input.hostname);
  if (fromOs) return fromOs;
  return clean(input.envHostname) || clean(input.hostname) || 'unknown';
}

export function serviceResourceAttributes(
  input: ServiceResourceInput,
): Record<string, string> {
  const attributes: Record<string, string> = {
    'service.name': input.serviceName,
    'deployment.environment': input.environment,
    'service.version': input.version,
    'host.name': input.hostName,
  };
  const podName = clean(input.podName);
  const podNamespace = clean(input.podNamespace);
  if (podName) attributes['k8s.pod.name'] = podName;
  if (podNamespace) attributes['k8s.namespace.name'] = podNamespace;
  return attributes;
}

function usableHost(value: string | undefined): string | undefined {
  const host = clean(value);
  if (!host || GENERIC_HOSTS.has(host)) return undefined;
  return host;
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
