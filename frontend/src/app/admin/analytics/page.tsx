'use client';

import { Download, FileText, Mail, TrendingUp, Users } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';

const GROWTH = [
  { month: 'Jan', locums: 71, hosts: 33, total: 47 },
  { month: 'Feb', locums: 100, hosts: 49, total: 67 },
  { month: 'Mar', locums: 136, hosts: 69, total: 92 },
  { month: 'Apr', locums: 173, hosts: 84, total: 116 },
  { month: 'May', locums: 198, hosts: 93, total: 131 },
];

const LOCATIONS = [
  { name: 'Halifax', pct: 28, count: 42 },
  { name: 'Dartmouth', pct: 21, count: 31 },
  { name: 'Cape Breton', pct: 19, count: 28 },
  { name: 'Truro', pct: 16, count: 24 },
  { name: 'New Glasgow', pct: 15, count: 22 },
];

export default function AdminAnalyticsPage() {
  return (
    <AdminLayout>
      <div className="header-with-actions">
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Analytics &amp; Reports</h1>
          <p className="page-description">
            Platform performance and user engagement metrics
          </p>
        </div>
        <div className="header-actions">
          <select className="input" style={{ width: 'auto', marginRight: 8 }} defaultValue="7">
            <option value="7">Last 7 Days</option>
            <option value="30">Last 30 Days</option>
            <option value="90">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button type="button" className="btn btn-primary">
            <Download size={16} />
            Export Report
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Total Applications</p>
              <p className="metric-value">156</p>
            </div>
            <div className="metric-icon">
              <FileText size={24} color="#4f46e5" />
            </div>
          </div>
          <div className="metric-trend">
            <TrendingUp size={12} color="#10b981" />
            <span className="trend-positive">+15%</span>
            <span className="trend-label">vs last week</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Fill Rate</p>
              <p className="metric-value">73%</p>
            </div>
            <div className="metric-icon">
              <TrendingUp size={24} color="#4f46e5" />
            </div>
          </div>
          <div className="metric-trend">
            <TrendingUp size={12} color="#10b981" />
            <span className="trend-positive">+3%</span>
            <span className="trend-label">vs last week</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Active Users (30d)</p>
              <p className="metric-value">131</p>
            </div>
            <div className="metric-icon">
              <Users size={24} color="#4f46e5" />
            </div>
          </div>
          <div className="metric-trend">
            <TrendingUp size={12} color="#10b981" />
            <span className="trend-positive">+18%</span>
            <span className="trend-label">vs last week</span>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <div>
              <p className="metric-label">Avg. Response Time</p>
              <p className="metric-value">4.2h</p>
              <p className="metric-subtext">Host to locum messages</p>
            </div>
            <div className="metric-icon">
              <Mail size={24} color="#4f46e5" />
            </div>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <h3 className="font-medium mb-4">User Growth (5 Months)</h3>
        <div className="chart-container">
          {GROWTH.map((g) => (
            <div key={g.month} className="chart-bar">
              <div className="chart-bars">
                <div className="chart-bar-locums" style={{ height: g.locums }} />
                <div className="chart-bar-hosts" style={{ height: g.hosts }} />
              </div>
              <div>
                <p className="chart-month">{g.month}</p>
                <p className="chart-total">{g.total}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#6366f1' }} />
            <span className="legend-label">Locums</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#c7d2fe' }} />
            <span className="legend-label">Hosts</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h3 className="font-medium mb-4">Posting Performance</h3>
          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Filled within 24h</span>
              <span className="progress-value">62%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill progress-emerald" style={{ width: '62%' }} />
            </div>
          </div>
          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Filled within 48h</span>
              <span className="progress-value">87%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill progress-blue" style={{ width: '87%' }} />
            </div>
          </div>
          <div className="progress-container">
            <div className="progress-header">
              <span className="progress-label">Still open (&gt;48h)</span>
              <span className="progress-value">13%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill progress-amber" style={{ width: '13%' }} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-medium mb-4">Top Locations</h3>
          {LOCATIONS.map((loc) => (
            <div key={loc.name} className="location-item">
              <span className="location-name">{loc.name}</span>
              <div className="location-bar">
                <div className="location-fill" style={{ width: `${loc.pct}%` }} />
              </div>
              <span className="location-count">{loc.count}</span>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
