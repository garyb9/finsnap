import { useEffect, useState } from 'react';
import styled from 'styled-components';

type HealthResponse = {
  status: string;
  timestamp: string;
};

type PollEntry = {
  id: number;
  requestedAt: string;
  completedAt: string;
  durationMs: number;
  response?: HealthResponse;
  error?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const Page = styled.main`
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px 40px;
  gap: 32px;
`;

const Header = styled.header`
  max-width: 880px;
  text-align: center;

  h1 {
    font-size: 2.5rem;
    letter-spacing: 0.04em;
    margin-bottom: 12px;
  }

  p {
    margin: 4px 0;
  }
`;

const ApiUrl = styled.p`
  code {
    background: rgba(15, 23, 42, 0.9);
    border-radius: 999px;
    padding: 4px 10px;
    border: 1px solid rgba(148, 163, 184, 0.3);
  }
`;

const TableSection = styled.section`
  width: 100%;
  max-width: 1080px;
  border-radius: 24px;
  padding: 24px;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: radial-gradient(circle at top left, #0f172a 0, #020617 55%);
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.6);
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 16px;
    border-radius: 18px;
  }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;

  thead th {
    text-align: left;
    font-weight: 500;
    padding: 8px 10px;
    color: #9ca3af;
    border-bottom: 1px solid rgba(148, 163, 184, 0.35);
    white-space: nowrap;
  }

  tbody td {
    padding: 8px 10px;
    border-bottom: 1px solid rgba(15, 23, 42, 0.8);
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(odd) {
    background: rgba(15, 23, 42, 0.45);
  }

  tbody tr:nth-child(even) {
    background: rgba(15, 23, 42, 0.2);
  }

  tbody tr:hover {
    background: rgba(56, 189, 248, 0.08);
  }

  tbody td:nth-child(4) {
    font-variant-numeric: tabular-nums;
  }

  tbody td:nth-child(5) {
    color: #38bdf8;
  }

  tbody td:nth-child(7) {
    color: #f97373;
  }
`;

export default function HomePage() {
  const [polls, setPolls] = useState<PollEntry[]>([]);

  useEffect(() => {
    let counter = 0;

    const runPoll = async () => {
      const start = Date.now();
      const requestedAt = new Date(start).toISOString();
      const id = ++counter;

      try {
        const res = await fetch(`${API_BASE}/health`);
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - start;

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = (await res.json()) as HealthResponse;

        setPolls((prev) => {
          const next = [
            {
              id,
              requestedAt,
              completedAt,
              durationMs,
              response: data,
            },
            ...prev,
          ];
          return next.slice(0, 10);
        });
      } catch (error) {
        const completedAt = new Date().toISOString();
        const durationMs = Date.now() - start;

        setPolls((prev) => {
          const next = [
            {
              id,
              requestedAt,
              completedAt,
              durationMs,
              error: error instanceof Error ? error.message : 'Unknown error',
            },
            ...prev,
          ];
          return next.slice(0, 10);
        });
      }
    };

    // initial poll immediately
    runPoll();
    const interval = setInterval(runPoll, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Page>
      <Header>
        <h1>Monorepo Template</h1>
        <p>
          Simple demo: frontend polling backend <code>/health</code> every 3 seconds.
        </p>
        <ApiUrl>
          Backend URL: <code>{API_BASE}/health</code>
        </ApiUrl>
      </Header>

      <TableSection>
        <Table>
          <thead>
            <tr>
              <th>#</th>
              <th>Requested At</th>
              <th>Completed At</th>
              <th>Duration (ms)</th>
              <th>Status</th>
              <th>Backend Timestamp</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {polls.map((poll) => (
              <tr key={poll.id}>
                <td>{poll.id}</td>
                <td>{poll.requestedAt}</td>
                <td>{poll.completedAt}</td>
                <td>{poll.durationMs}</td>
                <td>{poll.response?.status ?? '—'}</td>
                <td>{poll.response?.timestamp ?? '—'}</td>
                <td>{poll.error ?? '—'}</td>
              </tr>
            ))}
            {polls.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center' }}>
                  Waiting for first poll...
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </TableSection>
    </Page>
  );
}
