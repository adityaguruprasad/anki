import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
const dashboardApiRequests = require('./dashboardApiRequests');
const dashboardDeckTarget = require('./dashboardDeckTarget');
const dashboardStatsDisplayState = require('./dashboardStatsDisplayState');
const schedulingInsightsSummary = require('./schedulingInsightsSummary');
const authHeaders = require('./authHeaders');

const { getDashboardApiRequests } = dashboardApiRequests;
const { getStudyDeckTargetPath, hasDueCards, selectStudyDeckTarget } = dashboardDeckTarget;
const { buildDashboardStatsDisplayState } = dashboardStatsDisplayState;
const { buildSchedulingInsightsSummary } = schedulingInsightsSummary;
const { buildAuthHeaders } = authHeaders;

const Dashboard = ({ env }) => {
  const history = useHistory();
  const apiRequests = useMemo(() => getDashboardApiRequests(env), [env]);
  const isMountedRef = useRef(true);
  const latestStatsUrlRef = useRef(apiRequests.statsUrl);
  const statsRequestSequenceRef = useRef(0);
  const [stats, setStats] = useState(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsLoadFailed, setStatsLoadFailed] = useState(false);
  const [studyDeckTarget, setStudyDeckTarget] = useState(null);
  const [isLoadingDecks, setIsLoadingDecks] = useState(true);
  const [deckLoadFailed, setDeckLoadFailed] = useState(false);
  const [schedulingInsights, setSchedulingInsights] = useState(null);
  const [isLoadingSchedulingInsights, setIsLoadingSchedulingInsights] = useState(true);
  const [schedulingInsightsLoadFailed, setSchedulingInsightsLoadFailed] = useState(false);

  latestStatsUrlRef.current = apiRequests.statsUrl;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(async ({ shouldIgnore = () => false } = {}) => {
    const requestSequence = statsRequestSequenceRef.current + 1;
    statsRequestSequenceRef.current = requestSequence;
    const statsUrl = apiRequests.statsUrl;
    const shouldSkipUpdate = () => (
      !isMountedRef.current
      || shouldIgnore()
      || requestSequence !== statsRequestSequenceRef.current
      || statsUrl !== latestStatsUrlRef.current
    );

    if (shouldSkipUpdate()) {
      return;
    }

    setIsLoadingStats(true);

    try {
      const response = await fetch(statsUrl, {
        headers: buildAuthHeaders(localStorage)
      });
      if (!response.ok) {
        throw new Error('Unable to fetch stats');
      }
      const data = await response.json();
      if (shouldSkipUpdate()) {
        return;
      }
      setStats(data);
      setStatsLoadFailed(false);
    } catch (error) {
      if (shouldSkipUpdate()) {
        return;
      }
      console.error('Error fetching stats:', error);
      setStatsLoadFailed(true);
    } finally {
      if (!shouldSkipUpdate()) {
        setIsLoadingStats(false);
      }
    }
  }, [apiRequests.statsUrl]);

  useEffect(() => {
    let ignore = false;

    const fetchDecks = async () => {
      try {
        setIsLoadingDecks(true);
        setDeckLoadFailed(false);
        const response = await fetch(apiRequests.deckListUrl, {
          headers: buildAuthHeaders(localStorage)
        });
        if (!response.ok) {
          throw new Error('Unable to fetch decks');
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setStudyDeckTarget(selectStudyDeckTarget(data));
      } catch (error) {
        if (ignore) {
          return;
        }
        console.error('Error fetching decks:', error);
        setStudyDeckTarget(null);
        setDeckLoadFailed(true);
      } finally {
        if (!ignore) {
          setIsLoadingDecks(false);
        }
      }
    };

    const fetchSchedulingInsights = async () => {
      try {
        setIsLoadingSchedulingInsights(true);
        setSchedulingInsightsLoadFailed(false);
        const response = await fetch(apiRequests.schedulingInsightsUrl, {
          headers: buildAuthHeaders(localStorage)
        });
        if (!response.ok) {
          throw new Error('Unable to fetch scheduling insights');
        }
        const data = await response.json();
        if (ignore) {
          return;
        }
        setSchedulingInsights(data);
      } catch (error) {
        if (ignore) {
          return;
        }
        console.error('Error fetching scheduling insights:', error);
        setSchedulingInsights(null);
        setSchedulingInsightsLoadFailed(true);
      } finally {
        if (!ignore) {
          setIsLoadingSchedulingInsights(false);
        }
      }
    };

    fetchStats({ shouldIgnore: () => ignore });
    fetchDecks();
    fetchSchedulingInsights();

    return () => {
      ignore = true;
    };
  }, [apiRequests, fetchStats]);

  const handleStartStudying = () => {
    if (isLoadingDecks) {
      return;
    }

    history.push(getStudyDeckTargetPath(studyDeckTarget));
  };

  const handleRetryStats = () => {
    fetchStats();
  };

  const chartData = [
    { name: 'Today', cards: stats?.todayReviews || 0 },
    { name: 'This Week', cards: stats?.weekReviews || 0 },
    { name: 'This Month', cards: stats?.monthReviews || 0 },
  ];
  const hasDueStudyTarget = hasDueCards(studyDeckTarget);
  const schedulingSummary = buildSchedulingInsightsSummary(schedulingInsights);
  const statsDisplay = buildDashboardStatsDisplayState({
    stats,
    isLoadingStats,
    statsLoadFailed,
  });

  const studyPrompt = isLoadingDecks
    ? 'Checking deck availability...'
    : studyDeckTarget
      ? hasDueStudyTarget
        ? 'Resume with the next deck that has cards ready.'
        : 'No cards are due right now. Browse or manage your decks instead.'
      : deckLoadFailed
        ? 'Deck status could not be loaded. Manage your decks to add cards or try again.'
        : 'Add cards or create a deck before starting a study session.';
  const startButtonLabel = isLoadingDecks
    ? 'Checking Decks...'
    : studyDeckTarget
      ? hasDueStudyTarget
        ? 'Start Studying'
        : 'Browse Decks'
      : deckLoadFailed
        ? 'Manage Decks'
        : 'Add Cards or Decks';

  return (
    <div className="max-w-4xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-4">Dashboard</h2>
      {statsDisplay.showError && (
        <div
          className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
          aria-labelledby="dashboard-stats-error-title"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p id="dashboard-stats-error-title" className="font-semibold">
                {statsDisplay.errorTitle}
              </p>
              <p>{statsDisplay.errorMessage}</p>
            </div>
            <Button
              type="button"
              onClick={handleRetryStats}
              disabled={statsDisplay.retryDisabled}
            >
              {statsDisplay.retryButtonLabel}
            </Button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Total Cards</h3>
            <p
              className={statsDisplay.totalCards.isValue
                ? 'text-3xl font-bold'
                : 'text-sm font-medium text-gray-600'}
              role={statsDisplay.totalCards.isLoading ? 'status' : undefined}
              aria-live={statsDisplay.totalCards.isLoading ? 'polite' : undefined}
            >
              {statsDisplay.totalCards.text}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <h3 className="text-lg font-semibold mb-2">Total Decks</h3>
            <p
              className={statsDisplay.totalDecks.isValue
                ? 'text-3xl font-bold'
                : 'text-sm font-medium text-gray-600'}
              role={statsDisplay.totalDecks.isLoading ? 'status' : undefined}
              aria-live={statsDisplay.totalDecks.isLoading ? 'polite' : undefined}
            >
              {statsDisplay.totalDecks.text}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card className="mb-8">
        <CardContent className="p-4">
          <h3 className="text-lg font-semibold mb-4">Review Activity</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="cards" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
      <Card className="mb-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Scheduling Insights</h3>
            {isLoadingSchedulingInsights && (
              <span className="text-sm text-gray-500">Loading...</span>
            )}
          </div>
          {schedulingInsightsLoadFailed ? (
            <p className="text-sm text-gray-600">Scheduling insights could not be loaded.</p>
          ) : isLoadingSchedulingInsights && !schedulingInsights ? (
            <p className="text-sm text-gray-600">Loading scheduling insights...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div>
                  <p className="text-sm text-gray-500">Due today</p>
                  <p className="text-2xl font-bold">{schedulingSummary.dueToday}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Overdue</p>
                  <p className="text-2xl font-bold">{schedulingSummary.overdue}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Daily target</p>
                  <p className="text-2xl font-bold">{schedulingSummary.recommendedDailyReviewTarget}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Avg ease</p>
                  <p className="text-2xl font-bold">{schedulingSummary.averageEaseFactorLabel}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {schedulingSummary.upcomingBuckets.map((bucket) => (
                  <div key={bucket.key} className="flex items-center justify-between rounded border border-gray-200 px-3 py-2">
                    <span className="text-sm text-gray-600">{bucket.label}</span>
                    <span className="text-sm font-semibold">{bucket.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <div>
        <p className="text-sm text-gray-600 mb-3">{studyPrompt}</p>
        <Button onClick={handleStartStudying} disabled={isLoadingDecks}>
          {startButtonLabel}
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
