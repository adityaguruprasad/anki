import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckFailureMessage,
} from './deckCreateState';
import {
  DECK_LIST_LOAD_MESSAGES,
  beginDeckListLoad,
  finishDeckListLoadFailure,
  finishDeckListLoadSuccess,
  getDeckListLoadFailureMessage,
} from './deckListLoadState';
import {
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  renameDeckSubmission,
} from './deckRenameState';
import { getDeckManagementApiRequests } from './deckManagementApiRequests';
import {
  addCreatedCardToLoadedDeckCards,
  incrementDeckCardCounts,
  mergeUniqueCards,
} from './deckCardState';
import {
  beginDeckCardBrowserReplaceRequest,
  canStartDeckCardBrowserAppendRequest,
  canApplyDeckCardBrowserAppendResponse,
  clearDeckCardBrowserAppendRequest,
  createDeckCardBrowserAppendRequest,
  isLatestDeckCardBrowserReplaceRequest,
  setDeckCardBrowserAppendRequest,
} from './deckCardBrowserRequestState';
import {
  beginCardRemove,
  beginCardSave,
  clearCardAction,
  isCardActionInFlight,
} from './deckCardActionInFlightState';
import {
  beginDeckRemoval,
  clearDeckRemoval,
  isDeckRemovalInFlight,
} from './deckRemovalInFlightState';
import { createCardSubmission } from './deckCardCreateState';
import { buildAuthHeaders } from './authHeaders';

const CARD_PAGE_LIMIT = 10;
const CREATE_DECK_SUCCESS_VISIBLE_MS = 2500;

const DeckManagement = ({ env }) => {
  const history = useHistory();
  const apiRequests = useMemo(() => getDeckManagementApiRequests(env), [env]);
  const [decks, setDecks] = useState([]);
  const [deckListLoadState, setDeckListLoadState] = useState(() => beginDeckListLoad());
  const deckListRequestIdRef = useRef(0);
  const isDeckListMountedRef = useRef(false);
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
    isDeckListMountedRef.current = true;

    return () => {
      isDeckListMountedRef.current = false;
      deckListRequestIdRef.current += 1;
    };
  }, []);

  const fetchDecks = useCallback(async () => {
    const requestId = deckListRequestIdRef.current + 1;
    deckListRequestIdRef.current = requestId;
    setDeckListLoadState(beginDeckListLoad());

    const isCurrentDeckListRequest = () => (
      isDeckListMountedRef.current && deckListRequestIdRef.current === requestId
    );

    try {
      const response = await fetch(apiRequests.deckListUrl, {
        headers: buildAuthHeaders(localStorage)
      });

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        if (isCurrentDeckListRequest()) {
          setDeckListLoadState(finishDeckListLoadFailure(
            getDeckListLoadFailureMessage(errorPayload)
          ));
        }
        return false;
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        if (isCurrentDeckListRequest()) {
          setDeckListLoadState(finishDeckListLoadFailure(
            DECK_LIST_LOAD_MESSAGES.loadFailed
          ));
        }
        return false;
      }

      if (!isCurrentDeckListRequest()) {
        return false;
      }

      setDecks(data);
      setDeckListLoadState(finishDeckListLoadSuccess());
      return true;
    } catch (error) {
      console.error('Error fetching decks:', error);
      if (isCurrentDeckListRequest()) {
        setDeckListLoadState(finishDeckListLoadFailure(
          DECK_LIST_LOAD_MESSAGES.networkFailed
        ));
      }
      return false;
    }
  }, [apiRequests]);

  useEffect(() => {
    fetchDecks();
    return () => {
      deckListRequestIdRef.current += 1;
    };
  }, [fetchDecks]);

  useEffect(() => () => {
    if (createDeckSuccessTimerRef.current) {
      clearTimeout(createDeckSuccessTimerRef.current);
    }
  }, []);

  const clearCreateDeckSuccessTimer = () => {
    if (createDeckSuccessTimerRef.current) {
      clearTimeout(createDeckSuccessTimerRef.current);
      createDeckSuccessTimerRef.current = null;
    }
  };

  const showCreateDeckSuccess = () => {
    clearCreateDeckSuccessTimer();
    setCreateDeckStatus({
      creating: false,
      error: '',
      success: CREATE_DECK_MESSAGES.success,
    });
    createDeckSuccessTimerRef.current = setTimeout(() => {
      createDeckSuccessTimerRef.current = null;
      setCreateDeckStatus((currentStatus) => ({
        ...currentStatus,
        success: '',
      }));
    }, CREATE_DECK_SUCCESS_VISIBLE_MS);
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCreateDeckStatus({
          creating: false,
          error: getCreateDeckFailureMessage(data),
          success: '',
        });
        return;
      }

      setNewDeckName('');
      await fetchDecks();
      showCreateDeckSuccess();
    } catch (error) {
      console.error('Error creating deck:', error);
      setCreateDeckStatus({
        creating: false,
        error: CREATE_DECK_MESSAGES.networkFailed,
        success: '',
      });
    } finally {
      createDeckInFlightRef.current = false;
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setRenameErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: getRenameDeckFailureMessage(data),
        }));
        return;
      }

      clearRenameDeckState(deckId);
      await fetchDecks();
    } catch (error) {
      console.error('Error renaming deck:', error);
      setRenameErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: RENAME_DECK_MESSAGES.networkFailed,
      }));
    } finally {
      delete renameDeckInFlightRef.current[deckId];
      setRenamingDecks((currentDecks) => {
        const nextDecks = { ...currentDecks };
        delete nextDecks[deckId];
        return nextDecks;
      });
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

  const fetchDeckCards = async (deckId, options = {}) => {
    const { cursor = null, append = false } = options;
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
          error: '',
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
        setDeckCards((currentCards) => ({
          ...currentCards,
          [deckId]: {
            cards: [],
            nextCursor: null,
            hasLoaded: false,
            ...(currentCards[deckId] || {}),
            appliedSearchQuery: trimmedSearchQuery,
            loading: false,
            loadingMore: false,
            browserRequestId: append ? currentCards[deckId]?.browserRequestId : requestId,
            error: 'Unable to load more cards.',
          },
        }));
        return;
      }

      searchParams.set('cursorCreatedAt', cursorCreatedAt);
      searchParams.set('cursorId', cursorId);
    }

    try {
      const response = await fetch(apiRequests.browseDeckCardsUrl(deckId, searchParams), {
        headers: buildAuthHeaders(localStorage)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (!isCurrentDeckCardBrowserResponse()) {
          return;
        }

        clearCurrentAppendRequest();
        setDeckCards((currentCards) => ({
          ...currentCards,
          [deckId]: {
            cards: [],
            nextCursor: null,
            hasLoaded: false,
            ...(currentCards[deckId] || {}),
            loading: false,
            loadingMore: false,
            browserRequestId: append ? currentCards[deckId]?.browserRequestId : requestId,
            error: data.error || 'Unable to load cards.',
          },
        }));
        return;
      }

      const fetchedCards = Array.isArray(data.cards) ? data.cards : [];
      if (!isCurrentDeckCardBrowserResponse()) {
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
            cards: append ? mergeUniqueCards(currentRows, fetchedCards) : fetchedCards,
            nextCursor: data.nextCursor || null,
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
      setDeckCards((currentCards) => ({
        ...currentCards,
        [deckId]: {
          cards: [],
          nextCursor: null,
          hasLoaded: false,
          ...(currentCards[deckId] || {}),
          loading: false,
          loadingMore: false,
          browserRequestId: append ? currentCards[deckId]?.browserRequestId : requestId,
          appliedSearchQuery: trimmedSearchQuery,
          error: 'Network error. Please try again.',
        },
      }));
    }
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCardFormStatus(deckId, {
          error: data.error || 'Unable to add card.',
          success: '',
        });
        return;
      }

      setCardForms((currentForms) => ({
        ...currentForms,
        [deckId]: {
          frontContent: '',
          backContent: '',
          creating: false,
          error: '',
          success: 'Card added.',
        },
      }));
      setDecks((currentDecks) => incrementDeckCardCounts(currentDecks, deckId, data));
      setDeckCards((currentCards) => addCreatedCardToLoadedDeckCards(currentCards, deckId, data));
    } catch (error) {
      console.error('Error creating card:', error);
      setCardFormStatus(deckId, {
        error: 'Network error. Please try again.',
        success: '',
      });
    } finally {
      delete cardCreateInFlightRef.current[deckId];
      setCardFormStatus(deckId, {
        creating: false,
      });
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCardActionState(card.id, {
          saving: false,
          error: data.error || 'Unable to save card.',
          success: '',
        });
        return;
      }

      updateLoadedCard(deckId, card.id, data);
      setCardEditForms((currentForms) => ({
        ...currentForms,
        [card.id]: {
          frontContent: data.front_content ?? frontContent,
          backContent: data.back_content ?? backContent,
        },
      }));
      setCardActionState(card.id, {
        saving: false,
        error: '',
        success: 'Card saved.',
      });
    } catch (error) {
      console.error('Error updating card:', error);
      setCardActionState(card.id, {
        saving: false,
        error: 'Network error. Please try again.',
        success: '',
      });
    } finally {
      clearCardAction(cardActionInFlightRef.current, card.id);
    }
  };

  const deleteCard = async (deckId, cardId) => {
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCardActionState(cardId, {
          deleting: false,
          error: data.error || 'Unable to remove card.',
          success: '',
        });
        return;
      }

      removeLoadedCard(deckId, cardId);
      setCardEditForms((currentForms) => {
        const nextForms = { ...currentForms };
        delete nextForms[cardId];
        return nextForms;
      });
      clearCardActionState(cardId);
      fetchDecks();
    } catch (error) {
      console.error('Error deleting card:', error);
      setCardActionState(cardId, {
        deleting: false,
        error: 'Network error. Please try again.',
        success: '',
      });
    } finally {
      clearCardAction(cardActionInFlightRef.current, cardId);
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
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setDeleteErrors((currentErrors) => ({
          ...currentErrors,
          [deckId]: data.error || 'Unable to delete deck.',
        }));
        return;
      }

      setDeleteErrors((currentErrors) => {
        const nextErrors = { ...currentErrors };
        delete nextErrors[deckId];
        return nextErrors;
      });
      fetchDecks();
    } catch (error) {
      console.error('Error deleting deck:', error);
      setDeleteErrors((currentErrors) => ({
        ...currentErrors,
        [deckId]: 'Network error. Please try again.',
      }));
    } finally {
      setDeletingDecks((currentDecks) => {
        const nextDecks = { ...currentDecks };
        delete nextDecks[deckId];
        return nextDecks;
      });
      clearDeckRemoval(deckRemovalInFlightRef.current, deckId);
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
            onClick={fetchDecks}
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
            const hasActiveCardSearch = Boolean((currentDeckCards.appliedSearchQuery || '').trim());

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
                      {currentDeckCards.loading && (
                        <p className="text-sm text-gray-500">Loading cards...</p>
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
                                    onClick={() => deleteCard(deck.id, card.id)}
                                  >
                                    {isDeletingCard ? 'Removing...' : 'Remove'}
                                  </Button>
                                </div>
                              </form>
                            );
                          })}
                        </div>
                      )}
                      {currentDeckCards.hasLoaded && loadedCards.length === 0 && !currentDeckCards.loading && (
                        <p className="text-sm text-gray-500">
                          {hasActiveCardSearch ? 'No matching cards.' : 'No cards in this deck yet.'}
                        </p>
                      )}
                      {currentDeckCards.error && (
                        <p className="text-sm text-red-600">{currentDeckCards.error}</p>
                      )}
                      {currentDeckCards.nextCursor && (
                        <Button
                          type="button"
                          disabled={currentDeckCards.loadingMore}
                          onClick={() => fetchDeckCards(deck.id, {
                            cursor: currentDeckCards.nextCursor,
                            append: true,
                            q: currentDeckCards.appliedSearchQuery || '',
                            requestId: currentDeckCards.browserRequestId,
                          })}
                        >
                          {currentDeckCards.loadingMore ? 'Loading...' : 'Load more'}
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
