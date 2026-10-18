import { hostNameFrom, serviceResourceAttributes } from './resource.js';

describe('service resource attributes', () => {
  it('sets the identity Helix groups by, including the host', () => {
    expect(
      serviceResourceAttributes({
        serviceName: 'locumlink-api',
        environment: 'staging',
        version: '1.4.2',
        hostName: 'api-1',
      }),
    ).toEqual({
      'service.name': 'locumlink-api',
      'deployment.environment': 'staging',
      'service.version': '1.4.2',
      'host.name': 'api-1',
    });
  });

  it('adds the pod and namespace when the process is running in Kubernetes', () => {
    expect(
      serviceResourceAttributes({
        serviceName: 'locumlink-api',
        environment: 'production',
        version: '1.4.2',
        hostName: 'api-pod',
        podName: 'api-pod',
        podNamespace: 'locumlink',
      }),
    ).toMatchObject({
      'host.name': 'api-pod',
      'k8s.pod.name': 'api-pod',
      'k8s.namespace.name': 'locumlink',
    });
  });

  it('prefers a real host over localhost', () => {
    expect(
      hostNameFrom({
        hostname: 'localhost',
        envHostname: 'locumlink-api-abc',
      }),
    ).toBe('locumlink-api-abc');
    expect(hostNameFrom({ hostname: 'localhost' })).toBe('localhost');
    expect(hostNameFrom({ hostname: 'localhost', podName: 'api-pod' })).toBe(
      'api-pod',
    );
  });
});
