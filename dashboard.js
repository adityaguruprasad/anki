import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
const dashboardApiRequests = require('./dashboardApiRequests');
const dashboardDeckTarget = require('./dashboardDeckTarget');
const dashboardReviewActivityDisplayState = require('./dashboardReviewActivityDisplayState');
const dashboardStatsDisplayState = require('./dashboardStatsDisplayState');
const dashboardAuxiliaryDisplayState = require('./dashboardAuxiliaryDisplayState');
const dashboardRequestInFlightState = require('./dashboardRequestInFlightState');
const schedulingInsightsSummary = require('./schedulingInsightsSummary');
const authHeaders = require('./authHeaders');
const authExpiration = require('./authExpiration');

const { getDashboardApiRequests } = dashboardApiRequests;
const { getStudyDeckTargetPath, hasDashboardDeckListPayload, selectStudyDeckTarget } = dashboardDeckTarget;
const { buildDashboardReviewActivityDisplayState } = dashboardReviewActivityDisplayState;
const { buildDashboardStatsDisplayState, hasStatsPayload } = dashboardStatsDisplayState;
const {
  buildDeckAvailabilityDisplayState,
  buildSchedulingInsightsDisplayState,
  hasSchedulingInsightsPayload,
} = dashboardAuxiliaryDisplayState;
const {
  DASHBOARD_REQUEST_DOMAINS,
  beginDashboardRequest,
  completeDashboardRequest,
} = dashboardRequestInFlightState;
const { buildSchedulingInsightsSummary } = schedulingInsightsSummary;
const { buildAuthHeaders } = authHeaders;
const { handleAuthExpiredResponse } = authExpiration;

const Dashboard = ({ env, onAuthExpired }) => {
  const history = useHistory();
  const apiRequests = useMemo(() => getDashboardApiRequests(env), [env]);
  const isMountedRef = useRef(true);
  const dashboardRequestsInFlightRef = useRef({});
  const latestStatsUrlRef = useRef(apiRequests.statsUrl);
  const statsRequestSequenceRef = useRef(0);
  const latestDeckListUrlRef = useRef(apiRequests.deckListUrl);
  const deckRequestSequenceRef = useRef(0);
  const latestSchedulingInsightsUrlRef = useRef(apiRequests.schedulingInsightsUrl);
  const schedulingInsightsRequestSequenceRef = useRef(0);
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
  latestDeckListUrlRef.current = apiRequests.deckListUrl;
  latestSchedulingInsightsUrlRef.current = apiRequests.schedulingInsightsUrl;

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(async ({ shouldIgnore = () => false } = {}) => {
    const statsUrl = apiRequests.statsUrl;
    const shouldSkipRequest = () => (
      !isMountedRef.current
      || shouldIgnore()
      || statsUrl !== latestStatsUrlRef.current
    );

    if (shouldSkipRequest()) {
      return;
    }

    const requestGuard = beginDashboardRequest(
      dashboardRequestsInFlightRef.current,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      statsUrl
    );

    if (!requestGuard) {
      return;
    }

    const requestSequence = statsRequestSequenceRef.current + 1;
    statsRequestSequenceRef.current = requestSequence;
    const shouldSkipUpdate = () => (
      shouldSkipRequest()
      || requestSequence !== statsRequestSequenceRef.current
    );

    setIsLoadingStats(true);

    try {
      const response = await fetch(statsUrl, {
        headers: buildAuthHeaders(localStorage)
      });
      if (shouldSkipUpdate()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      if (!response.ok) {
        throw new Error('Unable to fetch stats');
      }
      const data = await response.json();
      if (shouldSkipUpdate()) {
        return;
      }
      if (!hasStatsPayload(data)) {
        throw new Error('Malformed stats payload');
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
      completeDashboardRequest(dashboardRequestsInFlightRef.current, requestGuard);
      if (!shouldSkipUpdate()) {
        setIsLoadingStats(false);
      }
    }
  }, [apiRequests.statsUrl, onAuthExpired]);

  const fetchDecks = useCallback(async ({ shouldIgnore = () => false } = {}) => {
    const deckListUrl = apiRequests.deckListUrl;
    const shouldSkipRequest = () => (
      !isMountedRef.current
      || shouldIgnore()
      || deckListUrl !== latestDeckListUrlRef.current
    );

    if (shouldSkipRequest()) {
      return;
    }

    const requestGuard = beginDashboardRequest(
      dashboardRequestsInFlightRef.current,
      DASHBOARD_REQUEST_DOMAINS.DECK_LIST,
      deckListUrl
    );

    if (!requestGuard) {
      return;
    }

    const requestSequence = deckRequestSequenceRef.current + 1;
    deckRequestSequenceRef.current = requestSequence;
    const shouldSkipUpdate = () => (
      shouldSkipRequest()
      || requestSequence !== deckRequestSequenceRef.current
    );

    setIsLoadingDecks(true);

    try {
      const response = await fetch(deckListUrl, {
        headers: buildAuthHeaders(localStorage)
      });
      if (shouldSkipUpdate()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      if (!response.ok) {
        throw new Error('Unable to fetch decks');
      }
      const data = await response.json();
      if (shouldSkipUpdate()) {
        return;
      }
      if (!hasDashboardDeckListPayload(data)) {
        throw new Error('Malformed deck list payload');
      }
      setStudyDeckTarget(selectStudyDeckTarget(data));
      setDeckLoadFailed(false);
    } catch (error) {
      if (shouldSkipUpdate()) {
        return;
      }
      console.error('Error fetching decks:', error);
      setDeckLoadFailed(true);
    } finally {
      completeDashboardRequest(dashboardRequestsInFlightRef.current, requestGuard);
      if (!shouldSkipUpdate()) {
        setIsLoadingDecks(false);
      }
    }
  }, [apiRequests.deckListUrl, onAuthExpired]);

  const fetchSchedulingInsights = useCallback(async ({ shouldIgnore = () => false } = {}) => {
    const schedulingInsightsUrl = apiRequests.schedulingInsightsUrl;
    const shouldSkipRequest = () => (
      !isMountedRef.current
      || shouldIgnore()
      || schedulingInsightsUrl !== latestSchedulingInsightsUrlRef.current
    );

    if (shouldSkipRequest()) {
      return;
    }

    const requestGuard = beginDashboardRequest(
      dashboardRequestsInFlightRef.current,
      DASHBOARD_REQUEST_DOMAINS.SCHEDULING_INSIGHTS,
      schedulingInsightsUrl
    );

    if (!requestGuard) {
      return;
    }

    const requestSequence = schedulingInsightsRequestSequenceRef.current + 1;
    schedulingInsightsRequestSequenceRef.current = requestSequence;
    const shouldSkipUpdate = () => (
      shouldSkipRequest()
      || requestSequence !== schedulingInsightsRequestSequenceRef.current
    );

    setIsLoadingSchedulingInsights(true);

    try {
      const response = await fetch(schedulingInsightsUrl, {
        headers: buildAuthHeaders(localStorage)
      });
      if (shouldSkipUpdate()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      if (!response.ok) {
        throw new Error('Unable to fetch scheduling insights');
      }
      const data = await response.json();
      if (shouldSkipUpdate()) {
        return;
      }
      if (!hasSchedulingInsightsPayload(data)) {
        throw new Error('Malformed scheduling insights payload');
      }
      setSchedulingInsights(data);
      setSchedulingInsightsLoadFailed(false);
    } catch (error) {
      if (shouldSkipUpdate()) {
        return;
      }
      console.error('Error fetching scheduling insights:', error);
      setSchedulingInsightsLoadFailed(true);
    } finally {
      completeDashboardRequest(dashboardRequestsInFlightRef.current, requestGuard);
      if (!shouldSkipUpdate()) {
        setIsLoadingSchedulingInsights(false);
      }
    }
  }, [apiRequests.schedulingInsightsUrl, onAuthExpired]);

  useEffect(() => {
    let ignore = false;

    fetchStats({ shouldIgnore: () => ignore });
    fetchDecks({ shouldIgnore: () => ignore });
    fetchSchedulingInsights({ shouldIgnore: () => ignore });

    return () => {
      ignore = true;
    };
  }, [fetchDecks, fetchSchedulingInsights, fetchStats]);

  const handleStartStudying = () => {
    if (isLoadingDecks) {
      return;
    }

    history.push(getStudyDeckTargetPath(studyDeckTarget));
  };

  const handleRetryStats = () => {
    fetchStats();
  };

  const handleRetryDecks = () => {
    fetchDecks();
  };

  const handleRetrySchedulingInsights = () => {
    fetchSchedulingInsights();
  };

  const reviewActivityDisplay = buildDashboardReviewActivityDisplayState({
    stats,
    isLoadingStats,
    statsLoadFailed,
  });
  const statsDisplay = buildDashboardStatsDisplayState({
    stats,
    isLoadingStats,
    statsLoadFailed,
  });
  const deckAvailabilityDisplay = buildDeckAvailabilityDisplayState({
    studyDeckTarget,
    isLoadingDecks,
    deckLoadFailed,
  });
  const schedulingInsightsDisplay = buildSchedulingInsightsDisplayState({
    schedulingInsights,
    isLoadingSchedulingInsights,
    schedulingInsightsLoadFailed,
  });
  const schedulingSummary = schedulingInsightsDisplay.showSummary
    ? buildSchedulingInsightsSummary(schedulingInsights)
    : null;

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
          {reviewActivityDisplay.showChart ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reviewActivityDisplay.chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="cards" fill="#8884d8" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p
              className="text-sm text-gray-600"
              role={reviewActivityDisplay.messageRole}
              aria-live={reviewActivityDisplay.messageAriaLive}
            >
              {reviewActivityDisplay.message}
            </p>
          )}
        </CardContent>
      </Card>
      <Card className="mb-8">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Scheduling Insights</h3>
            {schedulingInsightsDisplay.isLoading && (
              <span className="text-sm text-gray-500" role="status" aria-live="polite">
                {schedulingInsightsDisplay.headerLoadingText}
              </span>
            )}
          </div>
          {schedulingInsightsDisplay.showError && (
            <div
              className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
              role="alert"
              aria-labelledby="dashboard-scheduling-insights-error-title"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p id="dashboard-scheduling-insights-error-title" className="font-semibold">
                    {schedulingInsightsDisplay.errorTitle}
                  </p>
                  <p>{schedulingInsightsDisplay.errorMessage}</p>
                </div>
                <Button
                  type="button"
                  onClick={handleRetrySchedulingInsights}
                  disabled={schedulingInsightsDisplay.retryDisabled}
                >
                  {schedulingInsightsDisplay.retryButtonLabel}
                </Button>
              </div>
            </div>
          )}
          {schedulingInsightsDisplay.showLoadingBody ? (
            <p className="text-sm text-gray-600" role="status" aria-live="polite">
              {schedulingInsightsDisplay.loadingText}
            </p>
          ) : schedulingInsightsDisplay.showSummary ? (
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
          ) : null}
        </CardContent>
      </Card>
      <div>
        {deckAvailabilityDisplay.showError && (
          <div
            className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
            aria-labelledby="dashboard-deck-availability-error-title"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p id="dashboard-deck-availability-error-title" className="font-semibold">
                  {deckAvailabilityDisplay.errorTitle}
                </p>
                <p>{deckAvailabilityDisplay.errorMessage}</p>
              </div>
              <Button
                type="button"
                onClick={handleRetryDecks}
                disabled={deckAvailabilityDisplay.retryDisabled}
              >
                {deckAvailabilityDisplay.retryButtonLabel}
              </Button>
            </div>
          </div>
        )}
        <p
          className="text-sm text-gray-600 mb-3"
          role={deckAvailabilityDisplay.isLoading ? 'status' : undefined}
          aria-live={deckAvailabilityDisplay.isLoading ? 'polite' : undefined}
        >
          {deckAvailabilityDisplay.prompt}
        </p>
        <Button onClick={handleStartStudying} disabled={deckAvailabilityDisplay.ctaDisabled}>
          {deckAvailabilityDisplay.ctaLabel}
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
