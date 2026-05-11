import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
const deckCreateState = require('./deckCreateState');
const deckListLoadState = require('./deckListLoadState');
const deckRenameState = require('./deckRenameState');
const deckManagementApiRequests = require('./deckManagementApiRequests');
const deckManagementDeckListPayload = require('./deckManagementDeckListPayload');
const deckMutationResponse = require('./deckMutationResponse');
const deckRemovalResponse = require('./deckRemovalResponse');
const deckCollectionState = require('./deckCollectionState');
const deckCardState = require('./deckCardState');
const deckCardBrowseResponse = require('./deckCardBrowseResponse');
const deckCardMutationResponse = require('./deckCardMutationResponse');
const deckCardRemovalResponse = require('./deckCardRemovalResponse');
const deckCardBrowserRequestState = require('./deckCardBrowserRequestState');
const deckCardBrowserDisplayState = require('./deckCardBrowserDisplayState');
const deckCardActionInFlightState = require('./deckCardActionInFlightState');
const deckRemovalInFlightState = require('./deckRemovalInFlightState');
const deckCardCreateState = require('./deckCardCreateState');
const deckManagementMutationLifecycle = require('./deckManagementMutationLifecycle');
const authHeaders = require('./authHeaders');
const authExpiration = require('./authExpiration');

const {
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckFailureMessage,
} = deckCreateState;
const {
  DECK_LIST_LOAD_MESSAGES,
  beginDeckListLoad,
  finishDeckListLoadFailure,
  finishDeckListSilentFailure,
  finishDeckListLoadSuccess,
  getDeckListLoadFailureMessage,
  isCurrentDeckListRequest,
} = deckListLoadState;
const {
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  renameDeckSubmission,
} = deckRenameState;
const { getDeckManagementApiRequests } = deckManagementApiRequests;
const { parseDeckManagementDeckListPayload } = deckManagementDeckListPayload;
const { parseDeckMutationResponsePayload } = deckMutationResponse;
const { parseDeckRemovalSuccessPayload } = deckRemovalResponse;
const {
  addCreatedDeck,
  mergeRenamedDeck,
  removeDeckFromList,
} = deckCollectionState;
const {
  addCreatedCardToLoadedDeckCards,
  decrementDeckCardCounts,
  incrementDeckCardCounts,
  mergeUniqueCards,
} = deckCardState;
const { parseDeckCardBrowseResponsePayload } = deckCardBrowseResponse;
const { parseDeckCardMutationResponsePayload } = deckCardMutationResponse;
const { parseDeckCardRemovalSuccessPayload } = deckCardRemovalResponse;
const {
  beginDeckCardBrowserReplaceRequest,
  canStartDeckCardBrowserAppendRequest,
  canApplyDeckCardBrowserAppendResponse,
  clearDeckCardBrowserAppendRequest,
  createDeckCardBrowserAppendRequest,
  isLatestDeckCardBrowserReplaceRequest,
  setDeckCardBrowserAppendRequest,
} = deckCardBrowserRequestState;
const {
  DECK_CARD_BROWSER_ERROR_KINDS,
  buildDeckCardBrowserDisplayState,
  createDeckCardBrowserFailure,
} = deckCardBrowserDisplayState;
const {
  beginCardRemove,
  beginCardSave,
  clearCardAction,
  isCardActionInFlight,
} = deckCardActionInFlightState;
const {
  beginDeckRemoval,
  clearDeckRemoval,
  isDeckRemovalInFlight,
} = deckRemovalInFlightState;
const {
  CARD_CREATE_COMPLETION_TYPES,
  createCardSubmission,
  getCardCreateNetworkFailureCompletion,
  getCardCreateResponseCompletion,
  shouldRunCardCreateFinallyCleanup,
} = deckCardCreateState;
const {
  beginDeckManagementMutation,
  invalidateDeckManagementMutations,
  isCurrentDeckManagementMutation,
  isMountedDeckManagementMutation,
} = deckManagementMutationLifecycle;
const { buildAuthHeaders } = authHeaders;
const { handleAuthExpiredResponse } = authExpiration;

const CARD_PAGE_LIMIT = 10;
const CREATE_DECK_SUCCESS_VISIBLE_MS = 2500;

const DeckManagement = ({ env, onAuthExpired }) => {
  const history = useHistory();
  const apiRequests = useMemo(() => getDeckManagementApiRequests(env), [env]);
  const [decks, setDecks] = useState([]);
  const [deckListLoadState, setDeckListLoadState] = useState(() => beginDeckListLoad());
  const deckListRequestIdRef = useRef(0);
  const isDeckListMountedRef = useRef(false);
  const isDeckMutationMountedRef = useRef(false);
  const deckMutationSequenceRef = useRef({});
  const [newDeckName, setNewDeckName] = useState('');
  const [createDeckStatus, setCreateDeckStatus] = useState({
    creating: false,
    error: '',
    success: '',
  });
  const createDeckInFlightRef = useRef(false);
  const createDeckSuccessTimerRef = useRef(null);
  const [cardForms, setCardForms] = useState({});
  const cardCreateInFlightRef = useRef({});
  const [renameForms, setRenameForms] = useState({});
  const [renameErrors, setRenameErrors] = useState({});
  const [renamingDecks, setRenamingDecks] = useState({});
  const renameDeckInFlightRef = useRef({});
  const [deleteErrors, setDeleteErrors] = useState({});
  const [deletingDecks, setDeletingDecks] = useState({});
  const deckRemovalInFlightRef = useRef({});
  const [deckCards, setDeckCards] = useState({});
  const deckCardBrowserRequestStateRef = useRef({});
  const deckCardBrowserAppendRequestStateRef = useRef({});
  const [cardEditForms, setCardEditForms] = useState({});
  const [cardActionStates, setCardActionStates] = useState({});
  const cardActionInFlightRef = useRef({});

  useEffect(() => {
    isDeckMutationMountedRef.current = true;

    return () => {
      isDeckMutationMountedRef.current = false;
      invalidateDeckManagementMutations(deckMutationSequenceRef);
      createDeckInFlightRef.current = false;
      cardCreateInFlightRef.current = {};
      renameDeckInFlightRef.current = {};
      deckRemovalInFlightRef.current = {};
      cardActionInFlightRef.current = {};

      if (createDeckSuccessTimerRef.current) {
        clearTimeout(createDeckSuccessTimerRef.current);
        createDeckSuccessTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isDeckListMountedRef.current = true;

    return () => {
      isDeckListMountedRef.current = false;
      deckListRequestIdRef.current += 1;
    };
  }, []);

  const fetchDecks = useCallback(async (options = {}) => {
    const { silent = false } = options;
    const requestId = deckListRequestIdRef.current + 1;
    deckListRequestIdRef.current = requestId;
    if (!silent) {
      setDeckListLoadState(beginDeckListLoad());
    }

    const isCurrentDeckListResponse = () => isCurrentDeckListRequest({
      isMountedRef: isDeckListMountedRef,
      requestIdRef: deckListRequestIdRef,
      requestId,
    });

    const finishSilentDeckListFailure = () => {
      setDeckListLoadState((currentState) => finishDeckListSilentFailure(currentState));
    };

    try {
      const response = await fetch(apiRequests.deckListUrl, {
        headers: buildAuthHeaders(localStorage)
      });

      if (!isCurrentDeckListResponse()) {
        return false;
      }

      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return false;
      }

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        if (isCurrentDeckListResponse()) {
          if (silent) {
            finishSilentDeckListFailure();
          } else {
            setDeckListLoadState(finishDeckListLoadFailure(
              getDeckListLoadFailureMessage(errorPayload)
            ));
          }
        }
        return false;
      }

      const data = await response.json();
      if (!isCurrentDeckListResponse()) {
        return false;
      }

      let validatedDecks;
      try {
        validatedDecks = parseDeckManagementDeckListPayload(data);
      } catch (error) {
        console.error('Error validating deck list payload:', error);
        if (silent) {
          finishSilentDeckListFailure();
        } else {
          setDeckListLoadState(finishDeckListLoadFailure(
            DECK_LIST_LOAD_MESSAGES.loadFailed
          ));
        }
        return false;
      }

      setDecks(validatedDecks);
      setDeckListLoadState(finishDeckListLoadSuccess());
      return true;
    } catch (error) {
      console.error('Error fetching decks:', error);
      if (isCurrentDeckListResponse()) {
        if (silent) {
          finishSilentDeckListFailure();
        } else {
          setDeckListLoadState(finishDeckListLoadFailure(
            DECK_LIST_LOAD_MESSAGES.networkFailed
          ));
        }
      }
      return false;
    }
  }, [apiRequests, onAuthExpired]);

  useEffect(() => {
    fetchDecks();
    return () => {
      deckListRequestIdRef.current += 1;
    };
  }, [fetchDecks]);

  const clearCreateDeckSuccessTimer = () => {
    if (createDeckSuccessTimerRef.current) {
      clearTimeout(createDeckSuccessTimerRef.current);
      createDeckSuccessTimerRef.current = null;
    }
  };

  const showCreateDeckSuccess = () => {
    if (!isMountedDeckManagementMutation(isDeckMutationMountedRef)) {
      return;
    }

    clearCreateDeckSuccessTimer();
    setCreateDeckStatus({
      creating: false,
      error: '',
      success: CREATE_DECK_MESSAGES.success,
    });
    createDeckSuccessTimerRef.current = setTimeout(() => {
      if (!isMountedDeckManagementMutation(isDeckMutationMountedRef)) {
        return;
      }

      createDeckSuccessTimerRef.current = null;
      setCreateDeckStatus((currentStatus) => ({
        ...currentStatus,
        success: '',
      }));
    }, CREATE_DECK_SUCCESS_VISIBLE_MS);
  };

  const beginDeckMutationGuard = (mutationKey) => {
    const mutation = beginDeckManagementMutation(deckMutationSequenceRef, mutationKey);

    return () => isCurrentDeckManagementMutation({
      mountedRef: isDeckMutationMountedRef,
      sequenceRef: deckMutationSequenceRef,
      mutation,
    });
  };

  const updateCreateDeckName = (value) => {
    setNewDeckName(value);
    if (createDeckStatus.error || createDeckStatus.success) {
      clearCreateDeckSuccessTimer();
      setCreateDeckStatus((currentStatus) => ({
        ...currentStatus,
        error: '',
        success: '',
      }));
    }
  };

  const createDeck = async (event) => {
    event.preventDefault();

    const submission = createDeckSubmission({
      name: newDeckName,
      isSubmitting: createDeckInFlightRef.current,
    });

    if (submission.blocked) {
      return;
    }

    if (!submission.ok) {
      clearCreateDeckSuccessTimer();
      setCreateDeckStatus({
        creating: false,
        error: submission.error,
        success: '',
      });
      return;
    }

    createDeckInFlightRef.current = true;
    const isCurrentMutation = beginDeckMutationGuard('create-deck');
    clearCreateDeckSuccessTimer();
    setCreateDeckStatus({
      creating: true,
      error: '',
      success: '',
    });

    try {
      const response = await fetch(apiRequests.createDeckUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(localStorage)
        },
        body: JSON.stringify({ name: submission.name })
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        setCreateDeckStatus({
          creating: false,
          error: getCreateDeckFailureMessage(data),
          success: '',
        });
        return;
      }

      let createdDeck;
      try {
        createdDeck = parseDeckMutationResponsePayload(data);
      } catch {
        if (!isCurrentMutation()) {
          return;
        }
        setCreateDeckStatus({
          creating: false,
          error: CREATE_DECK_MESSAGES.createFailed,
          success: '',
        });
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      setNewDeckName('');
      setDecks((currentDecks) => addCreatedDeck(currentDecks, createdDeck, submission.name));
      if (!isCurrentMutation()) {
        return;
      }
      void fetchDecks({ silent: true });
      showCreateDeckSuccess();
    } catch (error) {
      if (!isCurrentMutation()) {
        return;
      }
      console.error('Error creating deck:', error);
      setCreateDeckStatus({
        creating: false,
        error: CREATE_DECK_MESSAGES.networkFailed,
        success: '',
      });
    } finally {
      if (isCurrentMutation()) {
        createDeckInFlightRef.current = false;
      }
    }
  };

  const updateRenameForm = (deckId, value) => {
    setRenameForms((currentForms) => ({
      ...currentForms,
      [deckId]: value,
    }));
    setRenameErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
  };

  const clearRenameDeckState = (deckId) => {
    setRenameForms((currentForms) => {
      const nextForms = { ...currentForms };
      delete nextForms[deckId];
      return nextForms;
    });
    setRenameErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[deckId];
      return nextErrors;
    });
  };

  const renameDeck = async (event, deckId, currentName) => {
    event.preventDefault();

    const nextName = renameForms[deckId] ?? currentName;
    const submission = renameDeckSubmission({
      name: nextName,
      currentName,
      isSubmitting: Boolean(renameDeckInFlightRef.current[deckId]),
    });

    if (submission.blocked) {
      return;
    }

    if (submission.unchanged) {
      clearRenameDeckState(deckId);
      return;
    }

    if (!submission.ok) {
      setRenameErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: submission.error,
      }));
      return;
    }

    renameDeckInFlightRef.current[deckId] = true;
    const isCurrentMutation = beginDeckMutationGuard(`rename-deck:${deckId}`);
    setRenameErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
    setRenamingDecks((currentDecks) => ({
      ...currentDecks,
      [deckId]: true,
    }));

    try {
      const response = await fetch(apiRequests.renameDeckUrl(deckId), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(localStorage)
        },
        body: JSON.stringify({ name: submission.name })
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        setRenameErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: getRenameDeckFailureMessage(data),
        }));
        return;
      }

      let renamedDeck;
      try {
        renamedDeck = parseDeckMutationResponsePayload(data, { expectedId: deckId });
      } catch {
        if (!isCurrentMutation()) {
          return;
        }
        setRenameErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: RENAME_DECK_MESSAGES.renameFailed,
        }));
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      clearRenameDeckState(deckId);
      setDecks((currentDecks) => mergeRenamedDeck(currentDecks, deckId, renamedDeck, submission.name));
      if (!isCurrentMutation()) {
        return;
      }
      void fetchDecks({ silent: true });
    } catch (error) {
      if (!isCurrentMutation()) {
        return;
      }
      console.error('Error renaming deck:', error);
      setRenameErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: RENAME_DECK_MESSAGES.networkFailed,
      }));
    } finally {
      if (isCurrentMutation()) {
        delete renameDeckInFlightRef.current[deckId];
        setRenamingDecks((currentDecks) => {
          const nextDecks = { ...currentDecks };
          delete nextDecks[deckId];
          return nextDecks;
        });
      }
    }
  };

  const updateCardForm = (deckId, field, value) => {
    setCardForms((currentForms) => ({
      ...currentForms,
      [deckId]: {
        frontContent: '',
        backContent: '',
        ...(currentForms[deckId] || {}),
        [field]: value,
        error: '',
        success: '',
      },
    }));
  };

  const setCardFormStatus = (deckId, status) => {
    setCardForms((currentForms) => ({
      ...currentForms,
      [deckId]: {
        frontContent: '',
        backContent: '',
        creating: false,
        error: '',
        success: '',
        ...(currentForms[deckId] || {}),
        ...status,
      },
    }));
  };

  const updateCardEditForm = (card, field, value) => {
    setCardEditForms((currentForms) => ({
      ...currentForms,
      [card.id]: {
        frontContent: card.front_content || '',
        backContent: card.back_content || '',
        ...(currentForms[card.id] || {}),
        [field]: value,
      },
    }));
    setCardActionStates((currentStates) => ({
      ...currentStates,
      [card.id]: {
        ...(currentStates[card.id] || {}),
        error: '',
        success: '',
      },
    }));
  };

  const setCardActionState = (cardId, status) => {
    setCardActionStates((currentStates) => ({
      ...currentStates,
      [cardId]: {
        saving: false,
        deleting: false,
        error: '',
        success: '',
        ...status,
      },
    }));
  };

  const clearCardActionState = (cardId) => {
    setCardActionStates((currentStates) => {
      const nextStates = { ...currentStates };
      delete nextStates[cardId];
      return nextStates;
    });
  };

  const updateLoadedCard = (deckId, cardId, nextCard) => {
    setDeckCards((currentCards) => {
      const currentDeckCards = currentCards[deckId];
      if (!currentDeckCards) {
        return currentCards;
      }

      return {
        ...currentCards,
        [deckId]: {
          ...currentDeckCards,
          cards: (currentDeckCards.cards || []).map((card) => (
            card.id === cardId ? { ...card, ...nextCard } : card
          )),
        },
      };
    });
  };

  const removeLoadedCard = (deckId, cardId) => {
    setDeckCards((currentCards) => {
      const currentDeckCards = currentCards[deckId];
      if (!currentDeckCards) {
        return currentCards;
      }

      return {
        ...currentCards,
        [deckId]: {
          ...currentDeckCards,
          cards: (currentDeckCards.cards || []).filter((card) => card.id !== cardId),
        },
      };
    });
  };

  const updateDeckCardSearch = (deckId, value) => {
    setDeckCards((currentCards) => {
      const currentDeckCards = currentCards[deckId] || {};
      const appliedSearchQuery = currentDeckCards.appliedSearchQuery || '';

      return {
        ...currentCards,
        [deckId]: {
          ...currentDeckCards,
          searchQuery: value,
          nextCursor: value.trim() === appliedSearchQuery ? currentDeckCards.nextCursor || null : null,
          error: '',
        },
      };
    });
  };

  const searchDeckCards = (event, deckId) => {
    event.preventDefault();
    const currentDeckCards = deckCards[deckId] || {};
    if (currentDeckCards.loading || currentDeckCards.loadingMore) {
      return;
    }

    fetchDeckCards(deckId, {
      q: currentDeckCards.searchQuery || '',
    });
  };

  const clearDeckCardSearch = (deckId, clearSearchRequest = { q: '' }) => {
    const currentDeckCards = deckCards[deckId] || {};
    if (currentDeckCards.loading || currentDeckCards.loadingMore) {
      return;
    }

    fetchDeckCards(deckId, {
      q: clearSearchRequest?.q || '',
    });
  };

  const fetchDeckCards = async (deckId, options = {}) => {
    const { cursor = null, append = false } = options;
    const isRetry = Boolean(options.retry);
    const hasExplicitQuery = Object.prototype.hasOwnProperty.call(options, 'q');
    const rawSearchQuery = hasExplicitQuery
      ? options.q
      : (deckCards[deckId]?.appliedSearchQuery ?? deckCards[deckId]?.searchQuery ?? '');
    const searchQuery = typeof rawSearchQuery === 'string' ? rawSearchQuery : '';
    const trimmedSearchQuery = searchQuery.trim();
    let requestId = null;
    let appendRequest = null;

    if (append) {
      appendRequest = createDeckCardBrowserAppendRequest(
        deckCardBrowserRequestStateRef.current,
        deckId,
        {
          searchQuery: trimmedSearchQuery,
          requestId: options.requestId,
          cursor,
        },
      );
      if (!canStartDeckCardBrowserAppendRequest(
        deckCardBrowserRequestStateRef.current,
        deckCardBrowserAppendRequestStateRef.current,
        deckId,
        appendRequest,
      )) {
        return;
      }

      deckCardBrowserAppendRequestStateRef.current = setDeckCardBrowserAppendRequest(
        deckCardBrowserAppendRequestStateRef.current,
        deckId,
        appendRequest,
      );
    } else {
      const nextRequest = beginDeckCardBrowserReplaceRequest(
        deckCardBrowserRequestStateRef.current,
        deckId,
        {
          searchQuery: trimmedSearchQuery,
        },
      );
      requestId = nextRequest.requestId;
      deckCardBrowserRequestStateRef.current = nextRequest.requestState;
      deckCardBrowserAppendRequestStateRef.current = clearDeckCardBrowserAppendRequest(
        deckCardBrowserAppendRequestStateRef.current,
        deckId,
      );
    }

    const isCurrentDeckCardBrowserResponse = () => (
      append
        ? canApplyDeckCardBrowserAppendResponse(
          deckCardBrowserRequestStateRef.current,
          deckCardBrowserAppendRequestStateRef.current,
          deckId,
          appendRequest,
        )
        : isLatestDeckCardBrowserReplaceRequest(
          deckCardBrowserRequestStateRef.current,
          deckId,
          requestId,
        )
    );

    const clearCurrentAppendRequest = () => {
      if (!appendRequest) {
        return;
      }

      deckCardBrowserAppendRequestStateRef.current = clearDeckCardBrowserAppendRequest(
        deckCardBrowserAppendRequestStateRef.current,
        deckId,
        appendRequest,
      );
    };

    const setDeckCardBrowserFailure = (message) => {
      const failure = createDeckCardBrowserFailure({
        kind: append
          ? DECK_CARD_BROWSER_ERROR_KINDS.APPEND
          : DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
        message,
        searchQuery: trimmedSearchQuery,
        cursor: append ? appendRequest?.cursor || cursor : null,
        requestId: append ? appendRequest?.requestId : requestId,
      });

      setDeckCards((currentCards) => {
        const currentDeckCards = currentCards[deckId] || {};

        return {
          ...currentCards,
          [deckId]: {
            ...currentDeckCards,
            cards: append ? currentDeckCards.cards || [] : [],
            nextCursor: append ? currentDeckCards.nextCursor || null : null,
            hasLoaded: append ? Boolean(currentDeckCards.hasLoaded) : false,
            loading: false,
            loadingMore: false,
            browserRequestId: append ? currentDeckCards.browserRequestId : requestId,
            appliedSearchQuery: trimmedSearchQuery,
            error: failure,
          },
        };
      });
    };

    setDeckCards((currentCards) => {
      const currentDeckCards = currentCards[deckId] || {};
      return {
        ...currentCards,
        [deckId]: {
          ...currentDeckCards,
          cards: append ? currentDeckCards.cards || [] : [],
          nextCursor: append ? currentDeckCards.nextCursor || null : null,
          hasLoaded: append ? Boolean(currentDeckCards.hasLoaded) : false,
          browserRequestId: append ? currentDeckCards.browserRequestId : requestId,
          expanded: true,
          searchQuery: hasExplicitQuery ? searchQuery : currentDeckCards.searchQuery || '',
          appliedSearchQuery: trimmedSearchQuery,
          loading: !append,
          loadingMore: append,
          error: isRetry ? currentDeckCards.error || '' : '',
        },
      };
    });

    const searchParams = new URLSearchParams({ limit: String(CARD_PAGE_LIMIT) });
    if (trimmedSearchQuery) {
      searchParams.set('q', trimmedSearchQuery);
    }

    if (cursor) {
      const cursorCreatedAt = cursor.cursorCreatedAt ?? cursor.beforeCreatedAt;
      const cursorId = cursor.cursorId ?? cursor.beforeId;

      if (!cursorCreatedAt || !cursorId) {
        clearCurrentAppendRequest();
        setDeckCardBrowserFailure('Unable to load more cards.');
        return;
      }

      searchParams.set('cursorCreatedAt', cursorCreatedAt);
      searchParams.set('cursorId', cursorId);
    }

    try {
      const response = await fetch(apiRequests.browseDeckCardsUrl(deckId, searchParams), {
        headers: buildAuthHeaders(localStorage)
      });
      if (!isCurrentDeckCardBrowserResponse()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (!isCurrentDeckCardBrowserResponse()) {
          return;
        }

        clearCurrentAppendRequest();
        setDeckCardBrowserFailure(data.error || (append ? 'Unable to load more cards.' : 'Unable to load cards.'));
        return;
      }

      if (!isCurrentDeckCardBrowserResponse()) {
        return;
      }

      let browseResponse;
      try {
        browseResponse = parseDeckCardBrowseResponsePayload(data);
      } catch (error) {
        clearCurrentAppendRequest();
        setDeckCardBrowserFailure(append ? 'Unable to load more cards.' : 'Unable to load cards.');
        return;
      }

      clearCurrentAppendRequest();
      setDeckCards((currentCards) => {
        const currentDeckCards = currentCards[deckId] || {};
        const currentRows = currentDeckCards.cards || [];
        return {
          ...currentCards,
          [deckId]: {
            ...currentDeckCards,
            expanded: currentDeckCards.expanded !== false,
            cards: append ? mergeUniqueCards(currentRows, browseResponse.cards) : browseResponse.cards,
            nextCursor: browseResponse.nextCursor,
            hasLoaded: true,
            loading: false,
            loadingMore: false,
            browserRequestId: append ? currentDeckCards.browserRequestId : requestId,
            appliedSearchQuery: trimmedSearchQuery,
            error: '',
          },
        };
      });
    } catch (error) {
      console.error('Error fetching deck cards:', error);
      if (!isCurrentDeckCardBrowserResponse()) {
        return;
      }

      clearCurrentAppendRequest();
      setDeckCardBrowserFailure('Network error. Please try again.');
    }
  };

  const retryDeckCards = (deckId, retryRequest) => {
    const currentDeckCards = deckCards[deckId] || {};
    if (!retryRequest || currentDeckCards.loading || currentDeckCards.loadingMore) {
      return;
    }

    if (retryRequest.append) {
      if (!retryRequest.cursor) {
        return;
      }

      fetchDeckCards(deckId, {
        cursor: retryRequest.cursor,
        append: true,
        q: retryRequest.q || '',
        requestId: retryRequest.requestId,
        retry: true,
      });
      return;
    }

    fetchDeckCards(deckId, {
      q: retryRequest.q || '',
      retry: true,
    });
  };

  const toggleDeckCards = (deckId) => {
    const currentDeckCards = deckCards[deckId];

    if (currentDeckCards?.expanded) {
      setDeckCards((currentCards) => ({
        ...currentCards,
        [deckId]: {
          ...currentCards[deckId],
          expanded: false,
        },
      }));
      return;
    }

    if (currentDeckCards?.hasLoaded) {
      setDeckCards((currentCards) => ({
        ...currentCards,
        [deckId]: {
          ...currentCards[deckId],
          expanded: true,
        },
      }));
      return;
    }

    fetchDeckCards(deckId);
  };

  const addCard = async (event, deckId) => {
    event.preventDefault();

    const currentForm = cardForms[deckId] || {};
    const submission = createCardSubmission({
      frontContent: currentForm.frontContent || '',
      backContent: currentForm.backContent || '',
      isSubmitting: Boolean(cardCreateInFlightRef.current[deckId]),
    });

    if (submission.blocked) {
      return;
    }

    if (!submission.ok) {
      setCardFormStatus(deckId, {
        creating: false,
        error: submission.error,
        success: '',
      });
      return;
    }

    cardCreateInFlightRef.current[deckId] = true;
    const isCurrentMutation = beginDeckMutationGuard(`create-card:${deckId}`);
    setCardFormStatus(deckId, {
      creating: true,
      error: '',
      success: '',
    });

    try {
      const response = await fetch(apiRequests.createCardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(localStorage)
        },
        body: JSON.stringify({
          deckId,
          frontContent: submission.frontContent,
          backContent: submission.backContent,
        })
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        const completion = getCardCreateResponseCompletion({
          isCurrent: isCurrentMutation(),
          responseOk: response.ok,
          payload: data,
        });
        if (completion.ignored) {
          return;
        }
        setCardFormStatus(deckId, {
          error: completion.error,
          success: '',
        });
        return;
      }

      const completion = getCardCreateResponseCompletion({
        isCurrent: isCurrentMutation(),
        responseOk: response.ok,
        payload: data,
      });
      if (completion.ignored) {
        return;
      }
      if (completion.type === CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE) {
        setCardFormStatus(deckId, {
          error: completion.error,
          success: '',
        });
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      const { createdCard } = completion;
      setCardForms((currentForms) => ({
        ...currentForms,
        [deckId]: {
          frontContent: '',
          backContent: '',
          creating: false,
          error: '',
          success: completion.success,
        },
      }));
      setDecks((currentDecks) => incrementDeckCardCounts(currentDecks, deckId, createdCard));
      setDeckCards((currentCards) => addCreatedCardToLoadedDeckCards(currentCards, deckId, createdCard));
    } catch (error) {
      const completion = getCardCreateNetworkFailureCompletion({
        isCurrent: isCurrentMutation(),
      });
      if (completion.ignored) {
        return;
      }
      console.error('Error creating card:', error);
      setCardFormStatus(deckId, {
        error: completion.error,
        success: '',
      });
    } finally {
      if (shouldRunCardCreateFinallyCleanup({ isCurrent: isCurrentMutation() })) {
        delete cardCreateInFlightRef.current[deckId];
        setCardFormStatus(deckId, {
          creating: false,
        });
      }
    }
  };

  const saveCard = async (event, deckId, card) => {
    event.preventDefault();

    const currentForm = cardEditForms[card.id] || {};
    const frontContent = currentForm.frontContent ?? card.front_content ?? '';
    const backContent = currentForm.backContent ?? card.back_content ?? '';

    if (!frontContent.trim() || !backContent.trim()) {
      setCardActionState(card.id, {
        saving: false,
        error: 'Front and back content are required.',
        success: '',
      });
      return;
    }

    if (!beginCardSave(cardActionInFlightRef.current, card.id)) {
      return;
    }

    const isCurrentMutation = beginDeckMutationGuard(`save-card:${card.id}`);
    setCardActionState(card.id, {
      saving: true,
      error: '',
      success: '',
    });

    try {
      const response = await fetch(apiRequests.updateCardUrl(card.id), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(localStorage)
        },
        body: JSON.stringify({
          frontContent,
          backContent,
        })
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        setCardActionState(card.id, {
          saving: false,
          error: data.error || 'Unable to save card.',
          success: '',
        });
        return;
      }

      let savedCard;
      try {
        savedCard = parseDeckCardMutationResponsePayload(data);
      } catch {
        if (!isCurrentMutation()) {
          return;
        }
        setCardActionState(card.id, {
          saving: false,
          error: 'Unable to save card.',
          success: '',
        });
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      updateLoadedCard(deckId, card.id, savedCard);
      setCardEditForms((currentForms) => ({
        ...currentForms,
        [card.id]: {
          frontContent: savedCard.front_content ?? frontContent,
          backContent: savedCard.back_content ?? backContent,
        },
      }));
      setCardActionState(card.id, {
        saving: false,
        error: '',
        success: 'Card saved.',
      });
    } catch (error) {
      if (!isCurrentMutation()) {
        return;
      }
      console.error('Error updating card:', error);
      setCardActionState(card.id, {
        saving: false,
        error: 'Network error. Please try again.',
        success: '',
      });
    } finally {
      if (isCurrentMutation()) {
        clearCardAction(cardActionInFlightRef.current, card.id);
      }
    }
  };

  const deleteCard = async (deckId, card) => {
    const isCardObject = card && typeof card === 'object';
    const cardId = isCardObject ? card.id : undefined;
    const hasUsableCardId = (
      (typeof cardId === 'number' && Number.isFinite(cardId)) ||
      (typeof cardId === 'string' && cardId.trim() !== '')
    );
    if (!isCardObject || !hasUsableCardId) {
      return;
    }

    // Avoid prompting for removal while a save/remove request for this card is already in flight.
    if (isCardActionInFlight(cardActionInFlightRef.current, cardId)) {
      return;
    }

    if (!window.confirm('Remove this card?')) {
      return;
    }

    if (!beginCardRemove(cardActionInFlightRef.current, cardId)) {
      return;
    }

    const isCurrentMutation = beginDeckMutationGuard(`delete-card:${cardId}`);
    setCardActionState(cardId, {
      deleting: true,
      error: '',
      success: '',
    });

    try {
      const response = await fetch(apiRequests.removeCardUrl(cardId), {
        method: 'DELETE',
        headers: buildAuthHeaders(localStorage)
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        setCardActionState(cardId, {
          deleting: false,
          error: data.error || 'Unable to remove card.',
          success: '',
        });
        return;
      }

      let removalResult;
      try {
        removalResult = parseDeckCardRemovalSuccessPayload(data);
      } catch {
        if (!isCurrentMutation()) {
          return;
        }
        setCardActionState(cardId, {
          deleting: false,
          error: 'Unable to remove card.',
          success: '',
        });
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      removeLoadedCard(deckId, cardId);
      setDecks((currentDecks) => decrementDeckCardCounts(currentDecks, deckId, removalResult.card));
      setCardEditForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[cardId];
        return nextForms;
      });
      clearCardActionState(cardId);
      if (!isCurrentMutation()) {
        return;
      }
      void fetchDecks({ silent: true });
    } catch (error) {
      if (!isCurrentMutation()) {
        return;
      }
      console.error('Error deleting card:', error);
      setCardActionState(cardId, {
        deleting: false,
        error: 'Network error. Please try again.',
        success: '',
      });
    } finally {
      if (isCurrentMutation()) {
        clearCardAction(cardActionInFlightRef.current, cardId);
      }
    }
  };

  const deleteDeck = async (deckId) => {
    // Precheck before confirm so duplicate clicks do not show repeated dialogs
    // while the first removal request is already in flight.
    if (isDeckRemovalInFlight(deckRemovalInFlightRef.current, deckId)) {
      return;
    }

    if (!window.confirm('Delete this deck and all of its cards?')) {
      return;
    }

    if (!beginDeckRemoval(deckRemovalInFlightRef.current, deckId)) {
      return;
    }

    const isCurrentMutation = beginDeckMutationGuard(`delete-deck:${deckId}`);
    setDeleteErrors((currentErrors) => ({
      ...currentErrors,
      [deckId]: '',
    }));
    setDeletingDecks((currentDecks) => ({
      ...currentDecks,
      [deckId]: true,
    }));

    try {
      const response = await fetch(apiRequests.removeDeckUrl(deckId), {
        method: 'DELETE',
        headers: buildAuthHeaders(localStorage)
      });
      if (!isCurrentMutation()) {
        return;
      }
      if (handleAuthExpiredResponse(response, onAuthExpired)) {
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (!isCurrentMutation()) {
        return;
      }

      if (!response.ok) {
        setDeleteErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: data.error || 'Unable to delete deck.',
        }));
        return;
      }

      try {
        parseDeckRemovalSuccessPayload(data);
      } catch {
        if (!isCurrentMutation()) {
          return;
        }
        setDeleteErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: 'Unable to delete deck.',
        }));
        return;
      }

      if (!isCurrentMutation()) {
        return;
      }
      setDeleteErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[deckId];
        return nextErrors;
      });
      setDecks((currentDecks) => removeDeckFromList(currentDecks, deckId));
      setDeckCards((currentCards) => {
        const nextCards = { ...currentCards };
        delete nextCards[deckId];
        return nextCards;
      });
      if (!isCurrentMutation()) {
        return;
      }
      void fetchDecks({ silent: true });
    } catch (error) {
      if (!isCurrentMutation()) {
        return;
      }
      console.error('Error deleting deck:', error);
      setDeleteErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: 'Network error. Please try again.',
      }));
    } finally {
      if (isCurrentMutation()) {
        setDeletingDecks((currentDecks) => {
          const nextDecks = { ...currentDecks };
          delete nextDecks[deckId];
          return nextDecks;
        });
        clearDeckRemoval(deckRemovalInFlightRef.current, deckId);
      }
    }
  };

  const isCreatingDeck = Boolean(createDeckStatus.creating);
  const createDeckStatusId = createDeckStatus.error || createDeckStatus.success
    ? 'create-deck-status'
    : undefined;
  const isDeckListLoading = Boolean(deckListLoadState.loading);
  const deckListError = deckListLoadState.error;
  const shouldShowDeckGrid = !deckListError || decks.length > 0;

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <h2 className="text-2xl font-bold mb-4">Manage Decks</h2>
      <form className="mb-4" onSubmit={createDeck}>
        <div className="flex">
          <Input
            type="text"
            value={newDeckName}
            onChange={(e) => updateCreateDeckName(e.target.value)}
            placeholder="New deck name"
            className="mr-2"
            disabled={isCreatingDeck}
            aria-invalid={Boolean(createDeckStatus.error)}
            aria-describedby={createDeckStatusId}
          />
          <Button type="submit" disabled={isCreatingDeck}>
            {isCreatingDeck ? 'Creating...' : 'Create Deck'}
          </Button>
        </div>
        {createDeckStatus.error && (
          <p id="create-deck-status" role="alert" className="mt-2 text-sm text-red-600">
            {createDeckStatus.error}
          </p>
        )}
        {createDeckStatus.success && (
          <p id="create-deck-status" aria-live="polite" className="mt-2 text-sm text-green-600">
            {createDeckStatus.success}
          </p>
        )}
      </form>
      {isDeckListLoading && (
        <p className="mb-4 text-sm text-gray-600" role="status" aria-live="polite">
          {DECK_LIST_LOAD_MESSAGES.loading}
        </p>
      )}
      {deckListError && (
        <div
          className="mb-4 rounded border border-red-200 bg-red-50 p-4"
          role="alert"
          aria-labelledby="deck-list-load-error-title"
        >
          <h3 id="deck-list-load-error-title" className="text-sm font-semibold text-red-800">
            Unable to load decks
          </h3>
          <p className="mt-1 text-sm text-red-700">{deckListError}</p>
          <Button
            type="button"
            className="mt-3"
            onClick={() => fetchDecks()}
            disabled={isDeckListLoading}
          >
            {isDeckListLoading ? 'Retrying...' : 'Try Again'}
          </Button>
        </div>
      )}
      {shouldShowDeckGrid && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {decks.map(deck => {
            const totalCards = deck.totalCards ?? 0;
            const dueCards = deck.dueCards ?? 0;
            const cardForm = cardForms[deck.id] || {};
            const isCreatingCard = Boolean(cardForm.creating);
            const renameValue = renameForms[deck.id] ?? deck.name;
            const renameError = renameErrors[deck.id];
            const renameErrorId = renameError ? `rename-deck-${deck.id}-error` : undefined;
            const isRenamingDeck = Boolean(renamingDecks[deck.id]);
            const deleteError = deleteErrors[deck.id];
            const isDeletingDeck = Boolean(deletingDecks[deck.id]);
            const currentDeckCards = deckCards[deck.id] || {};
            const isExpanded = Boolean(currentDeckCards.expanded);
            const loadedCards = currentDeckCards.cards || [];
            const cardBrowserDisplay = buildDeckCardBrowserDisplayState(currentDeckCards);
            const cardBrowserErrorTitleId = cardBrowserDisplay.showError
              ? `deck-${deck.id}-card-browser-error-title`
              : undefined;
            const cardBrowserErrorMessageId = cardBrowserDisplay.showError
              ? `deck-${deck.id}-card-browser-error-message`
              : undefined;
            const cardBrowserEmptyMessageId = cardBrowserDisplay.showEmptyState
              ? `deck-${deck.id}-card-browser-empty-message`
              : undefined;

            return (
              <Card key={deck.id}>
                <CardContent className="p-4">
                  <h3 className="text-lg font-semibold">{deck.name}</h3>
                  <p className="text-sm text-gray-500">Cards: {totalCards}</p>
                  <p className="text-sm text-gray-500">Due: {dueCards}</p>
                  <form className="mt-3 flex gap-2" onSubmit={(event) => renameDeck(event, deck.id, deck.name)}>
                    <Input
                      type="text"
                      value={renameValue}
                      onChange={(e) => updateRenameForm(deck.id, e.target.value)}
                      aria-label={`Rename ${deck.name}`}
                      aria-invalid={Boolean(renameError)}
                      aria-describedby={renameErrorId}
                      disabled={isRenamingDeck}
                    />
                    <Button type="submit" disabled={isRenamingDeck}>
                      {isRenamingDeck ? 'Saving...' : 'Rename'}
                    </Button>
                  </form>
                  {renameError && (
                    <p id={renameErrorId} role="alert" className="mt-2 text-sm text-red-600">
                      {renameError}
                    </p>
                  )}
                  <Button className="mt-2" onClick={() => history.push(`/study?${new URLSearchParams({ deckId: deck.id })}`)}>
                    Study
                  </Button>
                  <Button
                    className="mt-2 ml-2 bg-red-600 hover:bg-red-700"
                    disabled={isDeletingDeck}
                    onClick={() => deleteDeck(deck.id)}
                  >
                    {isDeletingDeck ? 'Deleting...' : 'Delete'}
                  </Button>
                  <Button className="mt-2 ml-2" onClick={() => toggleDeckCards(deck.id)}>
                    {isExpanded ? 'Hide cards' : 'View cards'}
                  </Button>
                  {deleteError && (
                    <p className="mt-2 text-sm text-red-600">{deleteError}</p>
                  )}
                  {isExpanded && (
                    <div className="mt-4 space-y-3">
                      <form className="flex gap-2" onSubmit={(event) => searchDeckCards(event, deck.id)}>
                        <Input
                          type="search"
                          value={currentDeckCards.searchQuery || ''}
                          onChange={(e) => updateDeckCardSearch(deck.id, e.target.value)}
                          placeholder="Search cards"
                          aria-label={`Search cards in ${deck.name}`}
                          className="text-sm"
                        />
                        <Button
                          type="submit"
                          disabled={currentDeckCards.loading || currentDeckCards.loadingMore}
                        >
                          Search
                        </Button>
                      </form>
                      {cardBrowserDisplay.showLoadingStatus && (
                        <p className="text-sm text-gray-500" role="status" aria-live="polite">
                          {cardBrowserDisplay.loadingText}
                        </p>
                      )}
                      {loadedCards.length > 0 && (
                        <div className="space-y-2">
                          {loadedCards.map((card) => {
                            const cardEditForm = cardEditForms[card.id] || {};
                            const cardActionState = cardActionStates[card.id] || {};
                            const isSavingCard = Boolean(cardActionState.saving);
                            const isDeletingCard = Boolean(cardActionState.deleting);

                            return (
                              <form
                                key={card.id}
                                className="space-y-2 rounded border border-gray-200 p-3"
                                onSubmit={(event) => saveCard(event, deck.id, card)}
                              >
                                <p className="text-sm font-medium text-gray-700">Front</p>
                                <textarea
                                  className="min-h-[80px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  value={cardEditForm.frontContent ?? card.front_content ?? ''}
                                  onChange={(e) => updateCardEditForm(card, 'frontContent', e.target.value)}
                                  aria-label="Card front"
                                  disabled={isSavingCard || isDeletingCard}
                                />
                                <p className="text-sm font-medium text-gray-700">Back</p>
                                <textarea
                                  className="min-h-[80px] w-full rounded-md border border-gray-300 px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                                  value={cardEditForm.backContent ?? card.back_content ?? ''}
                                  onChange={(e) => updateCardEditForm(card, 'backContent', e.target.value)}
                                  aria-label="Card back"
                                  disabled={isSavingCard || isDeletingCard}
                                />
                                {cardActionState.error && (
                                  <p className="text-sm text-red-600">{cardActionState.error}</p>
                                )}
                                {cardActionState.success && (
                                  <p className="text-sm text-green-600">{cardActionState.success}</p>
                                )}
                                <div className="flex gap-2">
                                  <Button type="submit" disabled={isSavingCard || isDeletingCard}>
                                    {isSavingCard ? 'Saving...' : 'Save'}
                                  </Button>
                                  <Button
                                    type="button"
                                    className="bg-red-600 hover:bg-red-700"
                                    disabled={isSavingCard || isDeletingCard}
                                    onClick={() => deleteCard(deck.id, card)}
                                  >
                                    {isDeletingCard ? 'Removing...' : 'Remove'}
                                  </Button>
                                </div>
                              </form>
                            );
                          })}
                        </div>
                      )}
                      {cardBrowserDisplay.showEmptyState && (
                        <div className="space-y-2">
                          <p
                            id={cardBrowserEmptyMessageId}
                            className="text-sm text-gray-500"
                            role="status"
                            aria-live="polite"
                          >
                            {cardBrowserDisplay.emptyMessage}
                          </p>
                          {cardBrowserDisplay.showEmptySearchResult && (
                            <Button
                              type="button"
                              disabled={currentDeckCards.loading || currentDeckCards.loadingMore}
                              onClick={() => clearDeckCardSearch(
                                deck.id,
                                cardBrowserDisplay.clearSearchRequest,
                              )}
                              aria-label={`Clear search for ${deck.name}`}
                              aria-describedby={cardBrowserEmptyMessageId}
                            >
                              {cardBrowserDisplay.clearSearchButtonLabel}
                            </Button>
                          )}
                        </div>
                      )}
                      {cardBrowserDisplay.showError && (
                        <div
                          className="rounded border border-red-200 bg-red-50 p-3"
                          role="alert"
                          aria-labelledby={cardBrowserErrorTitleId}
                          aria-describedby={cardBrowserErrorMessageId}
                        >
                          <p
                            id={cardBrowserErrorTitleId}
                            className="text-sm font-semibold text-red-800"
                          >
                            {cardBrowserDisplay.errorTitle}
                          </p>
                          <p id={cardBrowserErrorMessageId} className="mt-1 text-sm text-red-700">
                            {cardBrowserDisplay.errorMessage}
                          </p>
                          <Button
                            type="button"
                            className="mt-3"
                            disabled={cardBrowserDisplay.retryDisabled}
                            onClick={() => retryDeckCards(deck.id, cardBrowserDisplay.retryRequest)}
                          >
                            {cardBrowserDisplay.retryButtonLabel}
                          </Button>
                        </div>
                      )}
                      {cardBrowserDisplay.showLoadMore && (
                        <Button
                          type="button"
                          disabled={cardBrowserDisplay.isLoadingMore}
                          onClick={() => fetchDeckCards(deck.id, {
                            cursor: currentDeckCards.nextCursor,
                            append: true,
                            q: currentDeckCards.appliedSearchQuery || '',
                            requestId: currentDeckCards.browserRequestId,
                          })}
                        >
                          {cardBrowserDisplay.loadMoreButtonLabel}
                        </Button>
                      )}
                    </div>
                  )}
                  <form className="mt-4 space-y-2" onSubmit={(event) => addCard(event, deck.id)}>
                    <Input
                      type="text"
                      value={cardForm.frontContent || ''}
                      onChange={(e) => updateCardForm(deck.id, 'frontContent', e.target.value)}
                      placeholder="Front"
                      disabled={isCreatingCard}
                    />
                    <Input
                      type="text"
                      value={cardForm.backContent || ''}
                      onChange={(e) => updateCardForm(deck.id, 'backContent', e.target.value)}
                      placeholder="Back"
                      disabled={isCreatingCard}
                    />
                    {cardForm.error && (
                      <p className="text-sm text-red-600">{cardForm.error}</p>
                    )}
                    {cardForm.success && (
                      <p className="text-sm text-green-600">{cardForm.success}</p>
                    )}
                    <Button type="submit" className="mt-1" disabled={isCreatingCard}>
                      {isCreatingCard ? 'Adding card...' : 'Add Card'}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DeckManagement;
