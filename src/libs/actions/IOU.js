import {format} from 'date-fns';
import Str from 'expensify-common/lib/str';
import lodashGet from 'lodash/get';
import lodashHas from 'lodash/has';
import Onyx from 'react-native-onyx';
import OnyxUtils from 'react-native-onyx/lib/utils';
import _ from 'underscore';
import ReceiptGeneric from '@assets/images/receipt-generic.png';
import * as API from '@libs/API';
import * as CurrencyUtils from '@libs/CurrencyUtils';
import DateUtils from '@libs/DateUtils';
import * as ErrorUtils from '@libs/ErrorUtils';
import * as FileUtils from '@libs/fileDownload/FileUtils';
import * as IOUUtils from '@libs/IOUUtils';
import * as LocalePhoneNumber from '@libs/LocalePhoneNumber';
import * as Localize from '@libs/Localize';
import Navigation from '@libs/Navigation/Navigation';
import * as NumberUtils from '@libs/NumberUtils';
import * as OptionsListUtils from '@libs/OptionsListUtils';
import Permissions from '@libs/Permissions';
import * as PolicyUtils from '@libs/PolicyUtils';
import * as ReportActionsUtils from '@libs/ReportActionsUtils';
import * as ReportUtils from '@libs/ReportUtils';
import * as TransactionUtils from '@libs/TransactionUtils';
import * as UserUtils from '@libs/UserUtils';
import ViolationsUtils from '@libs/Violations/ViolationsUtils';
import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import ROUTES from '@src/ROUTES';
import * as Policy from './Policy';
import * as Report from './Report';

let betas;
Onyx.connect({
    key: ONYXKEYS.BETAS,
    callback: (val) => (betas = val || []),
});

let allPersonalDetails;
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (val) => {
        allPersonalDetails = val || {};
    },
});

let allReports;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.REPORT,
    waitForCollectionCallback: true,
    callback: (val) => (allReports = val),
});

let allTransactions;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION,
    waitForCollectionCallback: true,
    callback: (val) => {
        if (!val) {
            allTransactions = {};
            return;
        }

        allTransactions = val;
    },
});

let allTransactionDrafts = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (val) => {
        allTransactionDrafts = val || {};
    },
});

let allTransactionViolations;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS,
    waitForCollectionCallback: true,
    callback: (val) => {
        if (!val) {
            allTransactionViolations = {};
            return;
        }

        allTransactionViolations = val;
    },
});

let allDraftSplitTransactions;
Onyx.connect({
    key: ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT,
    waitForCollectionCallback: true,
    callback: (val) => {
        allDraftSplitTransactions = val || {};
    },
});

let allNextSteps = {};
Onyx.connect({
    key: ONYXKEYS.COLLECTION.NEXT_STEP,
    waitForCollectionCallback: true,
    callback: (val) => {
        allNextSteps = val || {};
    },
});

let userAccountID = '';
let currentUserEmail = '';
Onyx.connect({
    key: ONYXKEYS.SESSION,
    callback: (val) => {
        currentUserEmail = lodashGet(val, 'email', '');
        userAccountID = lodashGet(val, 'accountID', '');
    },
});

let currentUserPersonalDetails = {};
Onyx.connect({
    key: ONYXKEYS.PERSONAL_DETAILS_LIST,
    callback: (val) => {
        currentUserPersonalDetails = lodashGet(val, userAccountID, {});
    },
});

let currentDate = '';
Onyx.connect({
    key: ONYXKEYS.CURRENT_DATE,
    callback: (val) => {
        currentDate = val;
    },
});

/**
 * Initialize money request info
 * @param {String} reportID to attach the transaction to
 * @param {Boolean} isFromGlobalCreate
 * @param {String} [iouRequestType] one of manual/scan/distance
 */
function startMoneyRequest_temporaryForRefactor(reportID, isFromGlobalCreate, iouRequestType = CONST.IOU.REQUEST_TYPE.MANUAL) {
    // Generate a brand new transactionID
    const newTransactionID = CONST.IOU.OPTIMISTIC_TRANSACTION_ID;
    const created = currentDate || format(new Date(), 'yyyy-MM-dd');
    const comment = {};

    // Add initial empty waypoints when starting a distance request
    if (iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE) {
        comment.waypoints = {
            waypoint0: {},
            waypoint1: {},
        };
    }

    // Store the transaction in Onyx and mark it as not saved so it can be cleaned up later
    // Use set() here so that there is no way that data will be leaked between objects when it gets reset
    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${newTransactionID}`, {
        amount: 0,
        comment,
        created,
        currency: lodashGet(currentUserPersonalDetails, 'localCurrencyCode', CONST.CURRENCY.USD),
        iouRequestType,
        reportID,
        transactionID: newTransactionID,
        isFromGlobalCreate,
        merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
    });
}

/**
 * @param {String} transactionID
 */
function clearMoneyRequest(transactionID) {
    Onyx.set(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, null);
}

/**
 * @param {String} transactionID
 * @param {Number} amount
 * @param {String} currency
 */
function setMoneyRequestAmount_temporaryForRefactor(transactionID, amount, currency) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {amount, currency});
}

/**
 * @param {String} transactionID
 * @param {String} created
 */
function setMoneyRequestCreated_temporaryForRefactor(transactionID, created) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {created});
}

/**
 * @param {String} transactionID
 * @param {String} currency
 */
function setMoneyRequestCurrency_temporaryForRefactor(transactionID, currency) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {currency});
}

/**
 * @param {String} transactionID
 * @param {String} comment
 */
function setMoneyRequestDescription_temporaryForRefactor(transactionID, comment) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {comment: {comment: comment.trim()}});
}

/**
 * @param {String} transactionID
 * @param {String} merchant
 */
function setMoneyRequestMerchant_temporaryForRefactor(transactionID, merchant) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {merchant: merchant.trim()});
}

/**
 * @param {String} transactionID
 * @param {String} category
 */
function setMoneyRequestCategory_temporaryForRefactor(transactionID, category) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {category});
}

/*
 * @param {String} transactionID
 */
function resetMoneyRequestCategory_temporaryForRefactor(transactionID) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {category: null});
}

/*
 * @param {String} transactionID
 * @param {String} tag
 */
function setMoneyRequestTag_temporaryForRefactor(transactionID, tag) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {tag});
}

/*
 * @param {String} transactionID
 */
function resetMoneyRequestTag_temporaryForRefactor(transactionID) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {tag: null});
}

/**
 * @param {String} transactionID
 * @param {Boolean} billable
 */
function setMoneyRequestBillable_temporaryForRefactor(transactionID, billable) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {billable});
}

/**
 * @param {String} transactionID
 * @param {Object[]} participants
 */
function setMoneyRequestParticipants_temporaryForRefactor(transactionID, participants) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {participants});
}

/**
 * @param {String} transactionID
 * @param {String} source
 * @param {String} filename
 * @param {Boolean} isDraft
 */
function setMoneyRequestReceipt(transactionID, source, filename, isDraft) {
    Onyx.merge(`${isDraft ? ONYXKEYS.COLLECTION.TRANSACTION_DRAFT : ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        receipt: {source},
        filename,
    });
}

/**
 * Reset money request info from the store with its initial value
 * @param {String} id
 */
function resetMoneyRequestInfo(id = '') {
    const created = currentDate || format(new Date(), CONST.DATE.FNS_FORMAT_STRING);
    Onyx.merge(ONYXKEYS.IOU, {
        id,
        amount: 0,
        currency: lodashGet(currentUserPersonalDetails, 'localCurrencyCode', CONST.CURRENCY.USD),
        comment: '',
        participants: [],
        merchant: CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
        category: '',
        tag: '',
        created,
        receiptPath: '',
        receiptFilename: '',
        transactionID: '',
        billable: null,
        isSplitRequest: false,
    });
}

/**
 *  Helper function to get the receipt error for money requests, or the generic error if there's no receipt
 *
 * @param {Object} receipt
 * @param {String} filename
 * @param {Boolean} [isScanRequest]
 * @returns {Object}
 */
function getReceiptError(receipt, filename, isScanRequest = true) {
    return _.isEmpty(receipt) || !isScanRequest
        ? ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage')
        : ErrorUtils.getMicroSecondOnyxErrorObject({error: CONST.IOU.RECEIPT_ERROR, source: receipt.source, filename});
}

/**
 * Return the object to update hasOutstandingChildRequest
 * @param {Object} [policy]
 * @param {Boolean} needsToBeManuallySubmitted
 * @returns {Object}
 */
function getOutstandingChildRequest(policy, needsToBeManuallySubmitted) {
    if (!needsToBeManuallySubmitted) {
        return {
            hasOutstandingChildRequest: false,
        };
    }

    if (PolicyUtils.isPolicyAdmin(policy)) {
        return {
            hasOutstandingChildRequest: true,
        };
    }

    // We don't need to update hasOutstandingChildRequest in this case
    return {};
}

/**
 * Builds the Onyx data for a money request.
 *
 * @param {Object} chatReport
 * @param {Object} iouReport
 * @param {Object} transaction
 * @param {Object} chatCreatedAction
 * @param {Object} iouCreatedAction
 * @param {Object} iouAction
 * @param {Object} optimisticPersonalDetailListAction
 * @param {Object} reportPreviewAction
 * @param {Array} optimisticPolicyRecentlyUsedCategories
 * @param {Array} optimisticPolicyRecentlyUsedTags
 * @param {boolean} isNewChatReport
 * @param {boolean} isNewIOUReport
 * @param {Object} policy - May be undefined, an empty object, or an object matching the Policy type (src/types/onyx/Policy.ts)
 * @param {Array} policyTags
 * @param {Array} policyCategories
 * @param {Boolean} needsToBeManuallySubmitted
 * @returns {Array} - An array containing the optimistic data, success data, and failure data.
 */
function buildOnyxDataForMoneyRequest(
    chatReport,
    iouReport,
    transaction,
    chatCreatedAction,
    iouCreatedAction,
    iouAction,
    optimisticPersonalDetailListAction,
    reportPreviewAction,
    optimisticPolicyRecentlyUsedCategories,
    optimisticPolicyRecentlyUsedTags,
    isNewChatReport,
    isNewIOUReport,
    policy,
    policyTags,
    policyCategories,
    needsToBeManuallySubmitted = true,
) {
    const isScanRequest = TransactionUtils.isScanRequest(transaction);
    const outstandingChildRequest = getOutstandingChildRequest(needsToBeManuallySubmitted, policy);
    const optimisticData = [
        {
            // Use SET for new reports because it doesn't exist yet, is faster and we need the data to be available when we navigate to the chat page
            onyxMethod: isNewChatReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                ...chatReport,
                lastReadTime: DateUtils.getDBTime(),
                lastMessageTranslationKey: '',
                iouReportID: iouReport.reportID,
                ...outstandingChildRequest,
                ...(isNewChatReport ? {pendingFields: {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD}} : {}),
            },
        },
        {
            onyxMethod: isNewIOUReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                ...iouReport,
                lastMessageText: iouAction.message[0].text,
                lastMessageHtml: iouAction.message[0].html,
                pendingFields: {
                    ...(isNewIOUReport ? {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD} : {preview: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: transaction,
        },
        {
            onyxMethod: isNewChatReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                ...(isNewChatReport ? {[chatCreatedAction.reportActionID]: chatCreatedAction} : {}),
                [reportPreviewAction.reportActionID]: reportPreviewAction,
            },
        },
        {
            onyxMethod: isNewIOUReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                ...(isNewIOUReport ? {[iouCreatedAction.reportActionID]: iouCreatedAction} : {}),
                [iouAction.reportActionID]: iouAction,
            },
        },

        // Remove the temporary transaction used during the creation flow
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },
    ];

    if (!_.isEmpty(optimisticPolicyRecentlyUsedCategories)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport.policyID}`,
            value: optimisticPolicyRecentlyUsedCategories,
        });
    }

    if (!_.isEmpty(optimisticPolicyRecentlyUsedTags)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport.policyID}`,
            value: optimisticPolicyRecentlyUsedTags,
        });
    }

    if (!_.isEmpty(optimisticPersonalDetailListAction)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: optimisticPersonalDetailListAction,
        });
    }

    const successData = [
        ...(isNewChatReport
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                      value: {
                          pendingFields: null,
                          errorFields: null,
                      },
                  },
              ]
            : []),
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                pendingFields: null,
                errorFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                pendingAction: null,
                pendingFields: null,
            },
        },

        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                ...(isNewChatReport
                    ? {
                          [chatCreatedAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                ...(isNewIOUReport
                    ? {
                          [iouCreatedAction.reportActionID]: {
                              pendingAction: null,
                              errors: null,
                          },
                      }
                    : {}),
                [iouAction.reportActionID]: {
                    pendingAction: null,
                    errors: null,
                },
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                iouReportID: chatReport.iouReportID,
                lastReadTime: chatReport.lastReadTime,
                pendingFields: null,
                hasOutstandingChildRequest: chatReport.hasOutstandingChildRequest,
                ...(isNewChatReport
                    ? {
                          errorFields: {
                              createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                          },
                      }
                    : {}),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                pendingFields: null,
                errorFields: {
                    ...(isNewIOUReport ? {createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage')} : {}),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                pendingAction: null,
                pendingFields: null,
            },
        },

        // Remove the temporary transaction used during the creation flow
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },

        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                ...(isNewChatReport
                    ? {
                          [chatCreatedAction.reportActionID]: {
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt.filename, isScanRequest),
                          },
                          [reportPreviewAction.reportActionID]: {
                              errors: ErrorUtils.getMicroSecondOnyxError(null),
                          },
                      }
                    : {
                          [reportPreviewAction.reportActionID]: {
                              created: reportPreviewAction.created,
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt.filename, isScanRequest),
                          },
                      }),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                ...(isNewIOUReport
                    ? {
                          [iouCreatedAction.reportActionID]: {
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt.filename, isScanRequest),
                          },
                          [iouAction.reportActionID]: {
                              errors: ErrorUtils.getMicroSecondOnyxError(null),
                          },
                      }
                    : {
                          [iouAction.reportActionID]: {
                              errors: getReceiptError(transaction.receipt, transaction.filename || transaction.receipt.filename, isScanRequest),
                          },
                      }),
            },
        },
    ];

    // Policy won't be set for P2P cases for which we don't need to compute violations
    if (!policy || !policy.id) {
        return [optimisticData, successData, failureData];
    }

    const violationsOnyxData = ViolationsUtils.getViolationsOnyxData(transaction, [], policy.requiresTag, policyTags, policy.requiresCategory, policyCategories);

    if (violationsOnyxData) {
        optimisticData.push(violationsOnyxData);
        failureData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transaction.transactionID}`,
            value: [],
        });
    }

    return [optimisticData, successData, failureData];
}

/**
 * Gathers all the data needed to make a money request. It attempts to find existing reports, iouReports, and receipts. If it doesn't find them, then
 * it creates optimistic versions of them and uses those instead
 *
 * @param {Object} report
 * @param {Object} participant
 * @param {String} comment
 * @param {Number} amount
 * @param {String} currency
 * @param {String} created
 * @param {String} merchant
 * @param {Number} [payeeAccountID]
 * @param {String} [payeeEmail]
 * @param {Object} [receipt]
 * @param {String} [existingTransactionID]
 * @param {String} [category]
 * @param {String} [tag]
 * @param {Boolean} [billable]
 * @param {Object} [policy]
 * @param {Object} [policyTags]
 * @param {Object} [policyCategories]
 * @returns {Object} data
 * @returns {String} data.payerEmail
 * @returns {Object} data.iouReport
 * @returns {Object} data.chatReport
 * @returns {Object} data.transaction
 * @returns {Object} data.iouAction
 * @returns {Object} data.createdChatReportActionID
 * @returns {Object} data.createdIOUReportActionID
 * @returns {Object} data.reportPreviewAction
 * @returns {Object} data.onyxData
 * @returns {Object} data.onyxData.optimisticData
 * @returns {Object} data.onyxData.successData
 * @returns {Object} data.onyxData.failureData
 */
function getMoneyRequestInformation(
    report,
    participant,
    comment,
    amount,
    currency,
    created,
    merchant,
    payeeAccountID = userAccountID,
    payeeEmail = currentUserEmail,
    receipt = undefined,
    existingTransactionID = undefined,
    category = undefined,
    tag = undefined,
    billable = undefined,
    policy = undefined,
    policyTags = undefined,
    policyCategories = undefined,
) {
    const payerEmail = OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login);
    const payerAccountID = Number(participant.accountID);
    const isPolicyExpenseChat = participant.isPolicyExpenseChat;

    // STEP 1: Get existing chat report OR build a new optimistic one
    let isNewChatReport = false;
    let chatReport = lodashGet(report, 'reportID', null) ? report : null;

    // If this is a policyExpenseChat, the chatReport must exist and we can get it from Onyx.
    // report is null if the flow is initiated from the global create menu. However, participant always stores the reportID if it exists, which is the case for policyExpenseChats
    if (!chatReport && isPolicyExpenseChat) {
        chatReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${participant.reportID}`];
    }

    if (!chatReport) {
        chatReport = ReportUtils.getChatByParticipants([payerAccountID]);
    }

    // If we still don't have a report, it likely doens't exist and we need to build an optimistic one
    if (!chatReport) {
        isNewChatReport = true;
        chatReport = ReportUtils.buildOptimisticChatReport([payerAccountID]);
    }

    // STEP 2: Get existing IOU report and update its total OR build a new optimistic one
    const isNewIOUReport = !chatReport.iouReportID || ReportUtils.hasIOUWaitingOnCurrentUserBankAccount(chatReport);
    let iouReport = isNewIOUReport ? null : allReports[`${ONYXKEYS.COLLECTION.REPORT}${chatReport.iouReportID}`];

    // Check if the Scheduled Submit is enabled in case of expense report
    let needsToBeManuallySubmitted = true;
    let isFromPaidPolicy = false;
    if (isPolicyExpenseChat) {
        isFromPaidPolicy = PolicyUtils.isPaidGroupPolicy(policy);

        // If the scheduled submit is turned off on the policy, user needs to manually submit the report which is indicated by GBR in LHN
        needsToBeManuallySubmitted = isFromPaidPolicy && !(policy.isHarvestingEnabled || false);

        // If the linked expense report on paid policy is not draft, we need to create a new draft expense report
        if (iouReport && isFromPaidPolicy && !ReportUtils.isDraftExpenseReport(iouReport)) {
            iouReport = null;
        }
    }

    if (iouReport) {
        if (isPolicyExpenseChat) {
            iouReport = {...iouReport};
            if (lodashGet(iouReport, 'currency') === currency) {
                // Because of the Expense reports are stored as negative values, we substract the total from the amount
                iouReport.total -= amount;
            }
        } else {
            iouReport = IOUUtils.updateIOUOwnerAndTotal(iouReport, payeeAccountID, amount, currency);
        }
    } else {
        iouReport = isPolicyExpenseChat
            ? ReportUtils.buildOptimisticExpenseReport(chatReport.reportID, chatReport.policyID, payeeAccountID, amount, currency)
            : ReportUtils.buildOptimisticIOUReport(payeeAccountID, payerAccountID, amount, chatReport.reportID, currency);
    }

    // STEP 3: Build optimistic receipt and transaction
    const receiptObject = {};
    let filename;
    if (receipt && receipt.source) {
        receiptObject.source = receipt.source;
        receiptObject.state = receipt.state || CONST.IOU.RECEIPT_STATE.SCANREADY;
        filename = receipt.name;
    }
    let optimisticTransaction = TransactionUtils.buildOptimisticTransaction(
        ReportUtils.isExpenseReport(iouReport) ? -amount : amount,
        currency,
        iouReport.reportID,
        comment,
        created,
        '',
        '',
        merchant,
        receiptObject,
        filename,
        existingTransactionID,
        category,
        tag,
        billable,
    );

    const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, category);

    const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, tag);

    // If there is an existing transaction (which is the case for distance requests), then the data from the existing transaction
    // needs to be manually merged into the optimistic transaction. This is because buildOnyxDataForMoneyRequest() uses `Onyx.set()` for the transaction
    // data. This is a big can of worms to change it to `Onyx.merge()` as explored in https://expensify.slack.com/archives/C05DWUDHVK7/p1692139468252109.
    // I want to clean this up at some point, but it's possible this will live in the code for a while so I've created https://github.com/Expensify/App/issues/25417
    // to remind me to do this.
    const existingTransaction = allTransactionDrafts[`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`];
    if (existingTransaction && existingTransaction.iouRequestType === CONST.IOU.REQUEST_TYPE.DISTANCE) {
        optimisticTransaction = OnyxUtils.fastMerge(existingTransaction, optimisticTransaction);
    }

    // STEP 4: Build optimistic reportActions. We need:
    // 1. CREATED action for the chatReport
    // 2. CREATED action for the iouReport
    // 3. IOU action for the iouReport
    // 4. REPORTPREVIEW action for the chatReport
    // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
    const currentTime = DateUtils.getDBTime();
    const optimisticCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(payeeEmail);
    const optimisticCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(payeeEmail, DateUtils.subtractMillisecondsFromDateTime(currentTime, 1));
    const iouAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.CREATE,
        amount,
        currency,
        comment,
        [participant],
        optimisticTransaction.transactionID,
        '',
        iouReport.reportID,
        false,
        false,
        receiptObject,
        false,
        currentTime,
    );

    let reportPreviewAction = isNewIOUReport ? null : ReportActionsUtils.getReportPreviewAction(chatReport.reportID, iouReport.reportID);
    if (reportPreviewAction) {
        reportPreviewAction = ReportUtils.updateReportPreview(iouReport, reportPreviewAction, false, comment, optimisticTransaction);
    } else {
        reportPreviewAction = ReportUtils.buildOptimisticReportPreview(chatReport, iouReport, comment, optimisticTransaction);

        // Generated ReportPreview action is a parent report action of the iou report.
        // We are setting the iou report's parentReportActionID to display subtitle correctly in IOU page when offline.
        iouReport.parentReportActionID = reportPreviewAction.reportActionID;
    }

    const shouldCreateOptimisticPersonalDetails = isNewChatReport && !allPersonalDetails[payerAccountID];
    // Add optimistic personal details for participant
    const optimisticPersonalDetailListAction = shouldCreateOptimisticPersonalDetails
        ? {
              [payerAccountID]: {
                  accountID: payerAccountID,
                  avatar: UserUtils.getDefaultAvatarURL(payerAccountID),
                  displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || payerEmail),
                  login: participant.login,
                  isOptimisticPersonalDetail: true,
              },
          }
        : undefined;

    // STEP 5: Build Onyx Data
    const [optimisticData, successData, failureData] = buildOnyxDataForMoneyRequest(
        chatReport,
        iouReport,
        optimisticTransaction,
        optimisticCreatedActionForChat,
        optimisticCreatedActionForIOU,
        iouAction,
        optimisticPersonalDetailListAction,
        reportPreviewAction,
        optimisticPolicyRecentlyUsedCategories,
        optimisticPolicyRecentlyUsedTags,
        isNewChatReport,
        isNewIOUReport,
        policy,
        policyTags,
        policyCategories,
        needsToBeManuallySubmitted,
    );

    return {
        payerAccountID,
        payerEmail,
        iouReport,
        chatReport,
        transaction: optimisticTransaction,
        iouAction,
        createdChatReportActionID: isNewChatReport ? optimisticCreatedActionForChat.reportActionID : 0,
        createdIOUReportActionID: isNewIOUReport ? optimisticCreatedActionForIOU.reportActionID : 0,
        reportPreviewAction,
        onyxData: {
            optimisticData,
            successData,
            failureData,
        },
    };
}

/**
 * Requests money based on a distance (eg. mileage from a map)
 *
 * @param {Object} report
 * @param {Object} participant
 * @param {String} comment
 * @param {String} created
 * @param {String} [category]
 * @param {String} [tag]
 * @param {Number} amount
 * @param {String} currency
 * @param {String} merchant
 * @param {Boolean} [billable]
 * @param {Object} validWaypoints
 * @param {Object} policy - May be undefined, an empty object, or an object matching the Policy type (src/types/onyx/Policy.ts)
 * @param {Array} policyTags
 * @param {Array} policyCategories
 */
function createDistanceRequest(report, participant, comment, created, category, tag, amount, currency, merchant, billable, validWaypoints, policy, policyTags, policyCategories) {
    // If the report is an iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = ReportUtils.isMoneyRequestReport(report);
    const currentChatReport = isMoneyRequestReport ? ReportUtils.getReport(report.chatReportID) : report;

    const optimisticReceipt = {
        source: ReceiptGeneric,
        state: CONST.IOU.RECEIPT_STATE.OPEN,
    };
    const {iouReport, chatReport, transaction, iouAction, createdChatReportActionID, createdIOUReportActionID, reportPreviewAction, onyxData} = getMoneyRequestInformation(
        currentChatReport,
        participant,
        comment,
        amount,
        currency,
        created,
        merchant,
        userAccountID,
        currentUserEmail,
        optimisticReceipt,
        undefined,
        category,
        tag,
        billable,
        policy,
        policyTags,
        policyCategories,
    );
    API.write(
        'CreateDistanceRequest',
        {
            comment,
            iouReportID: iouReport.reportID,
            chatReportID: chatReport.reportID,
            transactionID: transaction.transactionID,
            reportActionID: iouAction.reportActionID,
            createdChatReportActionID,
            createdIOUReportActionID,
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
            waypoints: JSON.stringify(validWaypoints),
            created,
            category,
            tag,
            billable,
        },
        onyxData,
    );
    Navigation.dismissModal(isMoneyRequestReport ? report.reportID : chatReport.reportID);
    Report.notifyNewAction(chatReport.reportID, userAccountID);
}

/**
 * @param {String} transactionID
 * @param {String} transactionThreadReportID
 * @param {Object} transactionChanges
 * @param {String} [transactionChanges.created] Present when updated the date field
 * @param {Boolean} onlyIncludeChangedFields
 *                      When 'true', then the returned params will only include the transaction details for the fields that were changed.
 *                      When `false`, then the returned params will include all the transaction details, regardless of which fields were changed.
 *                      This setting is necessary while the UpdateDistanceRequest API is refactored to be fully 1:1:1 in https://github.com/Expensify/App/issues/28358
 * @returns {object}
 */
function getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, onlyIncludeChangedFields) {
    const optimisticData = [];
    const successData = [];
    const failureData = [];

    // Step 1: Set any "pending fields" (ones updated while the user was offline) to have error messages in the failureData
    const pendingFields = _.mapObject(transactionChanges, () => CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE);
    const clearedPendingFields = _.mapObject(transactionChanges, () => null);
    const errorFields = _.mapObject(pendingFields, () => ({
        [DateUtils.getMicroseconds()]: Localize.translateLocal('iou.error.genericEditFailureMessage'),
    }));

    // Step 2: Get all the collections being updated
    const transactionThread = allReports[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`];
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread.parentReportID}`];
    const isFromExpenseReport = ReportUtils.isExpenseReport(iouReport);
    const isScanning = TransactionUtils.hasReceipt(transaction) && TransactionUtils.isReceiptBeingScanned(transaction);
    const updatedTransaction = TransactionUtils.getUpdatedTransaction(transaction, transactionChanges, isFromExpenseReport);
    const transactionDetails = ReportUtils.getTransactionDetails(updatedTransaction);

    // This needs to be a JSON string since we're sending this to the MapBox API
    transactionDetails.waypoints = JSON.stringify(transactionDetails.waypoints);

    const dataToIncludeInParams = onlyIncludeChangedFields ? _.pick(transactionDetails, _.keys(transactionChanges)) : transactionDetails;

    const params = {
        ...dataToIncludeInParams,
        reportID: iouReport.reportID,
        transactionID,
    };

    // Step 3: Build the modified expense report actions
    // We don't create a modified report action if we're updating the waypoints,
    // since there isn't actually any optimistic data we can create for them and the report action is created on the server
    // with the response from the MapBox API
    if (!_.has(transactionChanges, 'waypoints')) {
        const updatedReportAction = ReportUtils.buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, isFromExpenseReport);
        params.reportActionID = updatedReportAction.reportActionID;

        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction,
            },
        });
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    ...updatedReportAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericEditFailureMessage'),
                },
            },
        });

        // Step 4: Compute the IOU total and update the report preview message (and report header) so LHN amount owed is correct.
        // Should only update if the transaction matches the currency of the report, else we wait for the update
        // from the server with the currency conversion
        let updatedMoneyRequestReport = {...iouReport};
        if (updatedTransaction.currency === iouReport.currency && updatedTransaction.modifiedAmount) {
            const diff = TransactionUtils.getAmount(transaction, true) - TransactionUtils.getAmount(updatedTransaction, true);
            if (ReportUtils.isExpenseReport(iouReport)) {
                updatedMoneyRequestReport.total += diff;
            } else {
                updatedMoneyRequestReport = IOUUtils.updateIOUOwnerAndTotal(iouReport, updatedReportAction.actorAccountID, diff, TransactionUtils.getCurrency(transaction), false);
            }

            updatedMoneyRequestReport.cachedTotal = CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedTransaction.currency);
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
                value: updatedMoneyRequestReport,
            });
            successData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
                value: {pendingAction: null},
            });
        }
    }

    // Optimistically modify the transaction
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            ...updatedTransaction,
            pendingFields,
            isLoading: _.has(transactionChanges, 'waypoints'),
            errorFields: null,
        },
    });

    if (isScanning && (_.has(transactionChanges, 'amount') || _.has(transactionChanges, 'currency'))) {
        optimisticData.push(
            ...[
                {
                    onyxMethod: Onyx.METHOD.MERGE,
                    key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                    value: {
                        [transactionThread.parentReportActionID]: {
                            whisperedToAccountIDs: [],
                        },
                    },
                },
                {
                    onyxMethod: Onyx.METHOD.MERGE,
                    key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.parentReportID}`,
                    value: {
                        [iouReport.parentReportActionID]: {
                            whisperedToAccountIDs: [],
                        },
                    },
                },
            ],
        );
    }
    // Update recently used categories if the category is changed
    if (_.has(transactionChanges, 'category')) {
        const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, transactionChanges.category);
        if (!_.isEmpty(optimisticPolicyRecentlyUsedCategories)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }
    }

    // Update recently used categories if the tag is changed
    if (_.has(transactionChanges, 'tag')) {
        const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, transactionChanges.tag);
        if (!_.isEmpty(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    }

    // Clear out the error fields and loading states on success
    successData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields: null,
        },
    });

    if (_.has(transactionChanges, 'waypoints')) {
        // Delete the draft transaction when editing waypoints when the server responds successfully and there are no errors
        successData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`,
            value: null,
        });
    }

    // Clear out loading states, pending fields, and add the error fields
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
        value: {
            pendingFields: clearedPendingFields,
            isLoading: false,
            errorFields,
        },
    });

    // Reset the iouReport to it's original state
    failureData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
        value: iouReport,
    });

    return {
        params,
        onyxData: {optimisticData, successData, failureData},
    };
}

/**
 * Updates the created date of a money request
 *
 * @param {String} transactionID
 * @param {String} transactionThreadReportID
 * @param {String} val
 */
function updateMoneyRequestDate(transactionID, transactionThreadReportID, val) {
    const transactionChanges = {
        created: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestDate', params, onyxData);
}

/**
 * Updates the billable field of a money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {String} val
 */
function updateMoneyRequestBillable(transactionID, transactionThreadReportID, val) {
    const transactionChanges = {
        billable: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestBillable', params, onyxData);
}

/**
 * Updates the merchant field of a money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {String} val
 */
function updateMoneyRequestMerchant(transactionID, transactionThreadReportID, val) {
    const transactionChanges = {
        merchant: val,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestMerchant', params, onyxData);
}

/**
 * Updates the tag of a money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {String} tag
 */
function updateMoneyRequestTag(transactionID, transactionThreadReportID, tag) {
    const transactionChanges = {
        tag,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestTag', params, onyxData);
}

/**
 * Updates the waypoints of a distance money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {Object} waypoints
 */
function updateMoneyRequestDistance(transactionID, transactionThreadReportID, waypoints) {
    const transactionChanges = {
        waypoints,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestDistance', params, onyxData);
}

/**
 * Updates the category of a money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {String} category
 */
function updateMoneyRequestCategory(transactionID, transactionThreadReportID, category) {
    const transactionChanges = {
        category,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestCategory', params, onyxData);
}

/**
 * Updates the description of a money request
 *
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {String} comment
 */
function updateMoneyRequestDescription(transactionID, transactionThreadReportID, comment) {
    const transactionChanges = {
        comment,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestDescription', params, onyxData);
}

/**
 * Edits an existing distance request
 *
 * @param {String} transactionID
 * @param {String} transactionThreadReportID
 * @param {Object} transactionChanges
 * @param {String} [transactionChanges.created]
 * @param {Number} [transactionChanges.amount]
 * @param {Object} [transactionChanges.comment]
 * @param {Object} [transactionChanges.waypoints]
 *
 */
function updateDistanceRequest(transactionID, transactionThreadReportID, transactionChanges) {
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, false);
    API.write('UpdateDistanceRequest', params, onyxData);
}

/**
 * Request money from another user
 *
 * @param {Object} report
 * @param {Number} amount - always in the smallest unit of the currency
 * @param {String} currency
 * @param {String} created
 * @param {String} merchant
 * @param {String} payeeEmail
 * @param {Number} payeeAccountID
 * @param {Object} participant
 * @param {String} comment
 * @param {Object} [receipt]
 * @param {String} [category]
 * @param {String} [tag]
 * @param {String} [taxCode]
 * @param {Number} [taxAmount]
 * @param {Boolean} [billable]
 * @param {Object} [policy]
 * @param {Object} [policyTags]
 * @param {Object} [policyCategories]
 */
function requestMoney(
    report,
    amount,
    currency,
    created,
    merchant,
    payeeEmail,
    payeeAccountID,
    participant,
    comment,
    receipt = undefined,
    category = undefined,
    tag = undefined,
    taxCode = '',
    taxAmount = 0,
    billable = undefined,
    policy = undefined,
    policyTags = undefined,
    policyCategories = undefined,
) {
    // If the report is iou or expense report, we should get the linked chat report to be passed to the getMoneyRequestInformation function
    const isMoneyRequestReport = ReportUtils.isMoneyRequestReport(report);
    const currentChatReport = isMoneyRequestReport ? ReportUtils.getReport(report.chatReportID) : report;
    const {payerAccountID, payerEmail, iouReport, chatReport, transaction, iouAction, createdChatReportActionID, createdIOUReportActionID, reportPreviewAction, onyxData} =
        getMoneyRequestInformation(
            currentChatReport,
            participant,
            comment,
            amount,
            currency,
            created,
            merchant,
            payeeAccountID,
            payeeEmail,
            receipt,
            undefined,
            category,
            tag,
            billable,
            policy,
            policyTags,
            policyCategories,
        );
    const activeReportID = isMoneyRequestReport ? report.reportID : chatReport.reportID;

    API.write(
        'RequestMoney',
        {
            debtorEmail: payerEmail,
            debtorAccountID: payerAccountID,
            amount,
            currency,
            comment,
            created,
            merchant,
            iouReportID: iouReport.reportID,
            chatReportID: chatReport.reportID,
            transactionID: transaction.transactionID,
            reportActionID: iouAction.reportActionID,
            createdChatReportActionID,
            createdIOUReportActionID,
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
            receipt,
            receiptState: lodashGet(receipt, 'state'),
            category,
            tag,
            taxCode,
            taxAmount,
            billable,
        },
        onyxData,
    );
    resetMoneyRequestInfo();
    Navigation.dismissModal(activeReportID);
    Report.notifyNewAction(activeReportID, payeeAccountID);
}

/**
 * Build the Onyx data and IOU split necessary for splitting a bill with 3+ users.
 * 1. Build the optimistic Onyx data for the group chat, i.e. chatReport and iouReportAction creating the former if it doesn't yet exist.
 * 2. Loop over the group chat participant list, building optimistic or updating existing chatReports, iouReports and iouReportActions between the user and each participant.
 * We build both Onyx data and the IOU split that is sent as a request param and is used by Auth to create the chatReports, iouReports and iouReportActions in the database.
 * The IOU split has the following shape:
 *  [
 *      {email: 'currentUser', amount: 100},
 *      {email: 'user2', amount: 100, iouReportID: '100', chatReportID: '110', transactionID: '120', reportActionID: '130'},
 *      {email: 'user3', amount: 100, iouReportID: '200', chatReportID: '210', transactionID: '220', reportActionID: '230'}
 *  ]
 * @param {Array} participants
 * @param {String} currentUserLogin
 * @param {Number} currentUserAccountID
 * @param {Number} amount - always in the smallest unit of the currency
 * @param {String} comment
 * @param {String} currency
 * @param {String} merchant
 * @param {String} category
 * @param {String} tag
 * @param {String} existingSplitChatReportID - the report ID where the split bill happens, could be a group chat or a workspace chat
 *
 * @return {Object}
 */
function createSplitsAndOnyxData(participants, currentUserLogin, currentUserAccountID, amount, comment, currency, merchant, category, tag, existingSplitChatReportID = '') {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = _.map(participants, (participant) => Number(participant.accountID));
    const existingSplitChatReport =
        existingSplitChatReportID || participants[0].reportID
            ? allReports[`${ONYXKEYS.COLLECTION.REPORT}${existingSplitChatReportID || participants[0].reportID}`]
            : ReportUtils.getChatByParticipants(participantAccountIDs);
    const splitChatReport = existingSplitChatReport || ReportUtils.buildOptimisticChatReport(participantAccountIDs);
    const isOwnPolicyExpenseChat = splitChatReport.isOwnPolicyExpenseChat;

    const splitTransaction = TransactionUtils.buildOptimisticTransaction(
        amount,
        currency,
        CONST.REPORT.SPLIT_REPORTID,
        comment,
        '',
        '',
        '',
        merchant || Localize.translateLocal('iou.request'),
        undefined,
        undefined,
        undefined,
        category,
        tag,
    );

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitCreatedReportAction = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        amount,
        currency,
        comment,
        participants,
        splitTransaction.transactionID,
        '',
        '',
        false,
        false,
        {},
        isOwnPolicyExpenseChat,
    );

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = splitIOUReportAction.message[0].text;
    splitChatReport.lastMessageHtml = splitIOUReportAction.message[0].html;

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        {
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitCreatedReportAction.reportActionID]: splitCreatedReportAction}),
                [splitIOUReportAction.reportActionID]: splitIOUReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}},
        });
    }

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${CONST.IOU.OPTIMISTIC_TRANSACTION_ID}`,
            value: null,
        },
    ];

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitIOUReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError(null),
                    },
                },
            },
        );
    }

    // Loop through participants creating individual chats, iouReports and reportActionIDs as needed
    const splitAmount = IOUUtils.calculateAmount(participants.length, amount, currency, false);
    const splits = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID, amount: IOUUtils.calculateAmount(participants.length, amount, currency, true)}];

    const hasMultipleParticipants = participants.length > 1;
    _.each(participants, (participant) => {
        // In a case when a participant is a workspace, even when a current user is not an owner of the workspace
        const isPolicyExpenseChat = ReportUtils.isPolicyExpenseChat(participant);

        // In case the participant is a workspace, email & accountID should remain undefined and won't be used in the rest of this code
        // participant.login is undefined when the request is initiated from a group DM with an unknown user, so we need to add a default
        const email = isOwnPolicyExpenseChat || isPolicyExpenseChat ? '' : OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login || '').toLowerCase();
        const accountID = isOwnPolicyExpenseChat || isPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // STEP 1: Get existing chat report OR build a new optimistic one
        // If we only have one participant and the request was initiated from the global create menu, i.e. !existingGroupChatReportID, the oneOnOneChatReport is the groupChatReport
        let oneOnOneChatReport;
        let isNewOneOnOneChatReport = false;
        let shouldCreateOptimisticPersonalDetails = false;
        const personalDetailExists = lodashHas(allPersonalDetails, accountID);

        // If this is a split between two people only and the function
        // wasn't provided with an existing group chat report id
        // or, if the split is being made from the workspace chat, then the oneOnOneChatReport is the same as the splitChatReport
        // in this case existingSplitChatReport will belong to the policy expense chat and we won't be
        // entering code that creates optimistic personal details
        if ((!hasMultipleParticipants && !existingSplitChatReportID) || isOwnPolicyExpenseChat) {
            oneOnOneChatReport = splitChatReport;
            shouldCreateOptimisticPersonalDetails = !existingSplitChatReport && !personalDetailExists;
        } else {
            const existingChatReport = ReportUtils.getChatByParticipants([accountID]);
            isNewOneOnOneChatReport = !existingChatReport;
            shouldCreateOptimisticPersonalDetails = isNewOneOnOneChatReport && !personalDetailExists;
            oneOnOneChatReport = existingChatReport || ReportUtils.buildOptimisticChatReport([accountID]);
        }

        // STEP 2: Get existing IOU/Expense report and update its total OR build a new optimistic one
        // For Control policy expense chats, if the report is already approved, create a new expense report
        let oneOnOneIOUReport = oneOnOneChatReport.iouReportID ? lodashGet(allReports, `${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`, undefined) : undefined;
        const shouldCreateNewOneOnOneIOUReport =
            _.isUndefined(oneOnOneIOUReport) || (isOwnPolicyExpenseChat && ReportUtils.isControlPolicyExpenseReport(oneOnOneIOUReport) && ReportUtils.isReportApproved(oneOnOneIOUReport));

        if (shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isOwnPolicyExpenseChat
                ? ReportUtils.buildOptimisticExpenseReport(oneOnOneChatReport.reportID, oneOnOneChatReport.policyID, currentUserAccountID, splitAmount, currency)
                : ReportUtils.buildOptimisticIOUReport(currentUserAccountID, accountID, splitAmount, oneOnOneChatReport.reportID, currency);
        } else if (isOwnPolicyExpenseChat) {
            // Because of the Expense reports are stored as negative values, we subtract the total from the amount
            oneOnOneIOUReport.total -= splitAmount;
        } else {
            oneOnOneIOUReport = IOUUtils.updateIOUOwnerAndTotal(oneOnOneIOUReport, currentUserAccountID, splitAmount, currency);
        }

        // STEP 3: Build optimistic transaction
        const oneOnOneTransaction = TransactionUtils.buildOptimisticTransaction(
            ReportUtils.isExpenseReport(oneOnOneIOUReport) ? -splitAmount : splitAmount,
            currency,
            oneOnOneIOUReport.reportID,
            comment,
            '',
            CONST.IOU.TYPE.SPLIT,
            splitTransaction.transactionID,
            merchant || Localize.translateLocal('iou.request'),
            undefined,
            undefined,
            undefined,
            category,
            tag,
        );

        // STEP 4: Build optimistic reportActions. We need:
        // 1. CREATED action for the chatReport
        // 2. CREATED action for the iouReport
        // 3. IOU action for the iouReport
        // 4. REPORTPREVIEW action for the chatReport
        // Note: The CREATED action for the IOU report must be optimistically generated before the IOU action so there's no chance that it appears after the IOU action in the chat
        const currentTime = DateUtils.getDBTime();
        const oneOnOneCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit, DateUtils.subtractMillisecondsFromDateTime(currentTime, 1));
        const oneOnOneIOUAction = ReportUtils.buildOptimisticIOUReportAction(
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            splitAmount,
            currency,
            comment,
            [participant],
            oneOnOneTransaction.transactionID,
            '',
            oneOnOneIOUReport.reportID,
            undefined,
            undefined,
            undefined,
            undefined,
            currentTime,
        );

        // Add optimistic personal details for new participants
        const oneOnOnePersonalDetailListAction = shouldCreateOptimisticPersonalDetails
            ? {
                  [accountID]: {
                      accountID,
                      avatar: UserUtils.getDefaultAvatarURL(accountID),
                      displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || email),
                      login: participant.login,
                      isOptimisticPersonalDetail: true,
                  },
              }
            : undefined;

        let oneOnOneReportPreviewAction = ReportActionsUtils.getReportPreviewAction(oneOnOneChatReport.reportID, oneOnOneIOUReport.reportID);
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = ReportUtils.updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = ReportUtils.buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport);
        }

        // Add category to optimistic policy recently used categories when a participant is a workspace
        const optimisticPolicyRecentlyUsedCategories = isPolicyExpenseChat ? Policy.buildOptimisticPolicyRecentlyUsedCategories(participant.policyID, category) : [];

        // Add tag to optimistic policy recently used tags when a participant is a workspace
        const optimisticPolicyRecentlyUsedTags = isPolicyExpenseChat ? Policy.buildOptimisticPolicyRecentlyUsedTags(participant.policyID, tag) : {};

        // STEP 5: Build Onyx Data
        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest(
            oneOnOneChatReport,
            oneOnOneIOUReport,
            oneOnOneTransaction,
            oneOnOneCreatedActionForChat,
            oneOnOneCreatedActionForIOU,
            oneOnOneIOUAction,
            oneOnOnePersonalDetailListAction,
            oneOnOneReportPreviewAction,
            optimisticPolicyRecentlyUsedCategories,
            optimisticPolicyRecentlyUsedTags,
            isNewOneOnOneChatReport,
            shouldCreateNewOneOnOneIOUReport,
        );

        const individualSplit = {
            email,
            accountID,
            amount: splitAmount,
            iouReportID: oneOnOneIOUReport.reportID,
            chatReportID: oneOnOneChatReport.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
        };

        splits.push(individualSplit);
        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    const splitData = {
        chatReportID: splitChatReport.reportID,
        transactionID: splitTransaction.transactionID,
        reportActionID: splitIOUReportAction.reportActionID,
        policyID: splitChatReport.policyID,
    };

    if (_.isEmpty(existingSplitChatReport)) {
        splitData.createdReportActionID = splitCreatedReportAction.reportActionID;
    }

    return {
        splitData,
        splits,
        onyxData: {optimisticData, successData, failureData},
    };
}

/**
 * @param {Array} participants
 * @param {String} currentUserLogin
 * @param {Number} currentUserAccountID
 * @param {Number} amount - always in smallest currency unit
 * @param {String} comment
 * @param {String} currency
 * @param {String} merchant
 * @param {String} category
 * @param {String} tag
 * @param {String} existingSplitChatReportID - Either a group DM or a workspace chat
 */
function splitBill(participants, currentUserLogin, currentUserAccountID, amount, comment, currency, merchant, category, tag, existingSplitChatReportID = '') {
    const {splitData, splits, onyxData} = createSplitsAndOnyxData(
        participants,
        currentUserLogin,
        currentUserAccountID,
        amount,
        comment,
        currency,
        merchant,
        category,
        tag,
        existingSplitChatReportID,
    );
    API.write(
        'SplitBill',
        {
            reportID: splitData.chatReportID,
            amount,
            splits: JSON.stringify(splits),
            currency,
            comment,
            category,
            merchant,
            tag,
            transactionID: splitData.transactionID,
            reportActionID: splitData.reportActionID,
            createdReportActionID: splitData.createdReportActionID,
            policyID: splitData.policyID,
        },
        onyxData,
    );

    resetMoneyRequestInfo();
    Navigation.dismissModal();
    Report.notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/**
 * @param {Array} participants
 * @param {String} currentUserLogin
 * @param {Number} currentUserAccountID
 * @param {Number} amount - always in smallest currency unit
 * @param {String} comment
 * @param {String} currency
 * @param {String} merchant
 * @param {String} category
 * @param {String} tag
 */
function splitBillAndOpenReport(participants, currentUserLogin, currentUserAccountID, amount, comment, currency, merchant, category, tag) {
    const {splitData, splits, onyxData} = createSplitsAndOnyxData(participants, currentUserLogin, currentUserAccountID, amount, comment, currency, merchant, category, tag);

    API.write(
        'SplitBillAndOpenReport',
        {
            reportID: splitData.chatReportID,
            amount,
            splits: JSON.stringify(splits),
            currency,
            merchant,
            comment,
            category,
            tag,
            transactionID: splitData.transactionID,
            reportActionID: splitData.reportActionID,
            createdReportActionID: splitData.createdReportActionID,
            policyID: splitData.policyID,
        },
        onyxData,
    );

    resetMoneyRequestInfo();
    Navigation.dismissModal(splitData.chatReportID);
    Report.notifyNewAction(splitData.chatReportID, currentUserAccountID);
}

/** Used exclusively for starting a split bill request that contains a receipt, the split request will be completed once the receipt is scanned
 *  or user enters details manually.
 *
 * @param {Array} participants
 * @param {String} currentUserLogin
 * @param {Number} currentUserAccountID
 * @param {String} comment
 * @param {String} category
 * @param {String} tag
 * @param {Object} receipt
 * @param {String} existingSplitChatReportID - Either a group DM or a workspace chat
 */
function startSplitBill(participants, currentUserLogin, currentUserAccountID, comment, category, tag, receipt, existingSplitChatReportID = '') {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(currentUserLogin);
    const participantAccountIDs = _.map(participants, (participant) => Number(participant.accountID));
    const existingSplitChatReport =
        existingSplitChatReportID || participants[0].reportID
            ? allReports[`${ONYXKEYS.COLLECTION.REPORT}${existingSplitChatReportID || participants[0].reportID}`]
            : ReportUtils.getChatByParticipants(participantAccountIDs);
    const splitChatReport = existingSplitChatReport || ReportUtils.buildOptimisticChatReport(participantAccountIDs);
    const isOwnPolicyExpenseChat = splitChatReport.isOwnPolicyExpenseChat || false;

    const {name: filename, source, state = CONST.IOU.RECEIPT_STATE.SCANREADY} = receipt;
    const receiptObject = {state, source};

    // ReportID is -2 (aka "deleted") on the group transaction
    const splitTransaction = TransactionUtils.buildOptimisticTransaction(
        0,
        CONST.CURRENCY.USD,
        CONST.REPORT.SPLIT_REPORTID,
        comment,
        '',
        '',
        '',
        CONST.TRANSACTION.PARTIAL_TRANSACTION_MERCHANT,
        receiptObject,
        filename,
        undefined,
        category,
        tag,
    );

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const splitChatCreatedReportAction = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
    const splitIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.SPLIT,
        0,
        CONST.CURRENCY.USD,
        comment,
        participants,
        splitTransaction.transactionID,
        '',
        '',
        false,
        false,
        receiptObject,
        isOwnPolicyExpenseChat,
    );

    splitChatReport.lastReadTime = DateUtils.getDBTime();
    splitChatReport.lastMessageText = splitIOUReportAction.message[0].text;
    splitChatReport.lastMessageHtml = splitIOUReportAction.message[0].html;

    // If we have an existing splitChatReport (group chat or workspace) use it's pending fields, otherwise indicate that we are adding a chat
    if (!existingSplitChatReport) {
        splitChatReport.pendingFields = {
            createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
        };
    }

    const optimisticData = [
        {
            // Use set for new reports because it doesn't exist yet, is faster,
            // and we need the data to be available when we navigate to the chat page
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: splitChatReport,
        },
        {
            onyxMethod: existingSplitChatReport ? Onyx.METHOD.MERGE : Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitChatCreatedReportAction.reportActionID]: splitChatCreatedReportAction}),
                [splitIOUReportAction.reportActionID]: splitIOUReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: splitTransaction,
        },
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                ...(existingSplitChatReport ? {} : {[splitChatCreatedReportAction.reportActionID]: {pendingAction: null}}),
                [splitIOUReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {pendingAction: null},
        },
    ];

    if (!existingSplitChatReport) {
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
            value: {pendingFields: {createChat: null}},
        });
    }

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
    ];

    if (existingSplitChatReport) {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
            value: {
                [splitIOUReportAction.reportActionID]: {
                    errors: getReceiptError(receipt, filename),
                },
            },
        });
    } else {
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT}${splitChatReport.reportID}`,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${splitChatReport.reportID}`,
                value: {
                    [splitChatCreatedReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                    [splitIOUReportAction.reportActionID]: {
                        errors: getReceiptError(receipt, filename),
                    },
                },
            },
        );
    }

    const splits = [{email: currentUserEmailForIOUSplit, accountID: currentUserAccountID}];

    _.each(participants, (participant) => {
        const email = participant.isOwnPolicyExpenseChat ? '' : OptionsListUtils.addSMSDomainIfPhoneNumber(participant.login || participant.text).toLowerCase();
        const accountID = participant.isOwnPolicyExpenseChat ? 0 : Number(participant.accountID);
        if (email === currentUserEmailForIOUSplit) {
            return;
        }

        // When splitting with a workspace chat, we only need to supply the policyID and the workspace reportID as it's needed so we can update the report preview
        if (participant.isOwnPolicyExpenseChat) {
            splits.push({
                policyID: participant.policyID,
                chatReportID: splitChatReport.reportID,
            });
            return;
        }

        const participantPersonalDetails = allPersonalDetails[participant.accountID];
        if (!participantPersonalDetails) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: ONYXKEYS.PERSONAL_DETAILS_LIST,
                value: {
                    [accountID]: {
                        accountID,
                        avatar: UserUtils.getDefaultAvatarURL(accountID),
                        displayName: LocalePhoneNumber.formatPhoneNumber(participant.displayName || email),
                        login: participant.login || participant.text,
                        isOptimisticPersonalDetail: true,
                    },
                },
            });
        }

        splits.push({
            email,
            accountID,
        });
    });

    _.each(participants, (participant) => {
        const isPolicyExpenseChat = ReportUtils.isPolicyExpenseChat(participant);
        if (!isPolicyExpenseChat) {
            return;
        }

        const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(participant.policyID, category);
        const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(participant.policyID, tag);

        if (!_.isEmpty(optimisticPolicyRecentlyUsedCategories)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${participant.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }

        if (!_.isEmpty(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${participant.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    });

    // Save the new splits array into the transaction's comment in case the user calls CompleteSplitBill while offline
    optimisticData.push({
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${splitTransaction.transactionID}`,
        value: {
            comment: {
                splits,
            },
        },
    });

    API.write(
        'StartSplitBill',
        {
            chatReportID: splitChatReport.reportID,
            reportActionID: splitIOUReportAction.reportActionID,
            transactionID: splitTransaction.transactionID,
            splits: JSON.stringify(splits),
            receipt,
            comment,
            category,
            tag,
            isFromGroupDM: !existingSplitChatReport,
            ...(existingSplitChatReport ? {} : {createdReportActionID: splitChatCreatedReportAction.reportActionID}),
        },
        {optimisticData, successData, failureData},
    );

    resetMoneyRequestInfo();
    Navigation.dismissModal(splitChatReport.reportID);
    Report.notifyNewAction(splitChatReport.chatReportID, currentUserAccountID);
}

/** Used for editing a split bill while it's still scanning or when SmartScan fails, it completes a split bill started by startSplitBill above.
 *
 * @param {number} chatReportID - The group chat or workspace reportID
 * @param {Object} reportAction - The split action that lives in the chatReport above
 * @param {Object} updatedTransaction - The updated **draft** split transaction
 * @param {Number} sessionAccountID - accountID of the current user
 * @param {String} sessionEmail - email of the current user
 */
function completeSplitBill(chatReportID, reportAction, updatedTransaction, sessionAccountID, sessionEmail) {
    const currentUserEmailForIOUSplit = OptionsListUtils.addSMSDomainIfPhoneNumber(sessionEmail);
    const {transactionID} = updatedTransaction;
    const unmodifiedTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];

    // Save optimistic updated transaction and action
    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...updatedTransaction,
                receipt: {
                    state: CONST.IOU.RECEIPT_STATE.OPEN,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    lastModified: DateUtils.getDBTime(),
                    whisperedToAccountIDs: [],
                },
            },
        },
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`,
            value: null,
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...unmodifiedTransaction,
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericCreateFailureMessage'),
                },
            },
        },
    ];

    const splitParticipants = updatedTransaction.comment.splits;
    const {modifiedAmount: amount, modifiedCurrency: currency} = updatedTransaction;

    // Exclude the current user when calculating the split amount, `calculateAmount` takes it into account
    const splitAmount = IOUUtils.calculateAmount(splitParticipants.length - 1, amount, currency, false);

    const splits = [{email: currentUserEmailForIOUSplit}];
    _.each(splitParticipants, (participant) => {
        // Skip creating the transaction for the current user
        if (participant.email === currentUserEmailForIOUSplit) {
            return;
        }
        const isPolicyExpenseChat = !_.isEmpty(participant.policyID);

        if (!isPolicyExpenseChat) {
            // In case this is still the optimistic accountID saved in the splits array, return early as we cannot know
            // if there is an existing chat between the split creator and this participant
            // Instead, we will rely on Auth generating the report IDs and the user won't see any optimistic chats or reports created
            const participantPersonalDetails = allPersonalDetails[participant.accountID] || {};
            if (!participantPersonalDetails || participantPersonalDetails.isOptimisticPersonalDetail) {
                splits.push({
                    email: participant.email,
                });
                return;
            }
        }

        let oneOnOneChatReport;
        let isNewOneOnOneChatReport = false;
        if (isPolicyExpenseChat) {
            // The workspace chat reportID is saved in the splits array when starting a split bill with a workspace
            oneOnOneChatReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${participant.chatReportID}`];
        } else {
            const existingChatReport = ReportUtils.getChatByParticipants([participant.accountID]);
            isNewOneOnOneChatReport = !existingChatReport;
            oneOnOneChatReport = existingChatReport || ReportUtils.buildOptimisticChatReport([participant.accountID]);
        }

        let oneOnOneIOUReport = oneOnOneChatReport.iouReportID ? lodashGet(allReports, `${ONYXKEYS.COLLECTION.REPORT}${oneOnOneChatReport.iouReportID}`, undefined) : undefined;
        const shouldCreateNewOneOnOneIOUReport =
            _.isUndefined(oneOnOneIOUReport) || (isPolicyExpenseChat && ReportUtils.isControlPolicyExpenseReport(oneOnOneIOUReport) && ReportUtils.isReportApproved(oneOnOneIOUReport));

        if (shouldCreateNewOneOnOneIOUReport) {
            oneOnOneIOUReport = isPolicyExpenseChat
                ? ReportUtils.buildOptimisticExpenseReport(oneOnOneChatReport.reportID, participant.policyID, sessionAccountID, splitAmount, currency)
                : ReportUtils.buildOptimisticIOUReport(sessionAccountID, participant.accountID, splitAmount, oneOnOneChatReport.reportID, currency);
        } else if (isPolicyExpenseChat) {
            // Because of the Expense reports are stored as negative values, we subtract the total from the amount
            oneOnOneIOUReport.total -= splitAmount;
        } else {
            oneOnOneIOUReport = IOUUtils.updateIOUOwnerAndTotal(oneOnOneIOUReport, sessionAccountID, splitAmount, currency);
        }

        const oneOnOneTransaction = TransactionUtils.buildOptimisticTransaction(
            isPolicyExpenseChat ? -splitAmount : splitAmount,
            currency,
            oneOnOneIOUReport.reportID,
            updatedTransaction.comment.comment,
            updatedTransaction.modifiedCreated,
            CONST.IOU.TYPE.SPLIT,
            transactionID,
            updatedTransaction.modifiedMerchant,
            {...updatedTransaction.receipt, state: CONST.IOU.RECEIPT_STATE.OPEN},
            updatedTransaction.filename,
        );

        const oneOnOneCreatedActionForChat = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneCreatedActionForIOU = ReportUtils.buildOptimisticCreatedReportAction(currentUserEmailForIOUSplit);
        const oneOnOneIOUAction = ReportUtils.buildOptimisticIOUReportAction(
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            splitAmount,
            currency,
            updatedTransaction.comment.comment,
            [participant],
            oneOnOneTransaction.transactionID,
            '',
            oneOnOneIOUReport.reportID,
        );

        let oneOnOneReportPreviewAction = ReportActionsUtils.getReportPreviewAction(oneOnOneChatReport.reportID, oneOnOneIOUReport.reportID);
        if (oneOnOneReportPreviewAction) {
            oneOnOneReportPreviewAction = ReportUtils.updateReportPreview(oneOnOneIOUReport, oneOnOneReportPreviewAction);
        } else {
            oneOnOneReportPreviewAction = ReportUtils.buildOptimisticReportPreview(oneOnOneChatReport, oneOnOneIOUReport, '', oneOnOneTransaction);
        }

        const [oneOnOneOptimisticData, oneOnOneSuccessData, oneOnOneFailureData] = buildOnyxDataForMoneyRequest(
            oneOnOneChatReport,
            oneOnOneIOUReport,
            oneOnOneTransaction,
            oneOnOneCreatedActionForChat,
            oneOnOneCreatedActionForIOU,
            oneOnOneIOUAction,
            {},
            oneOnOneReportPreviewAction,
            {},
            {},
            isNewOneOnOneChatReport,
            shouldCreateNewOneOnOneIOUReport,
        );

        splits.push({
            email: participant.email,
            accountID: participant.accountID,
            policyID: participant.policyID,
            iouReportID: oneOnOneIOUReport.reportID,
            chatReportID: oneOnOneChatReport.reportID,
            transactionID: oneOnOneTransaction.transactionID,
            reportActionID: oneOnOneIOUAction.reportActionID,
            createdChatReportActionID: oneOnOneCreatedActionForChat.reportActionID,
            createdIOUReportActionID: oneOnOneCreatedActionForIOU.reportActionID,
            reportPreviewReportActionID: oneOnOneReportPreviewAction.reportActionID,
        });

        optimisticData.push(...oneOnOneOptimisticData);
        successData.push(...oneOnOneSuccessData);
        failureData.push(...oneOnOneFailureData);
    });

    const {
        amount: transactionAmount,
        currency: transactionCurrency,
        created: transactionCreated,
        merchant: transactionMerchant,
        comment: transactionComment,
        category: transactionCategory,
        tag: transactionTag,
    } = ReportUtils.getTransactionDetails(updatedTransaction);

    API.write(
        'CompleteSplitBill',
        {
            transactionID,
            amount: transactionAmount,
            currency: transactionCurrency,
            created: transactionCreated,
            merchant: transactionMerchant,
            comment: transactionComment,
            category: transactionCategory,
            tag: transactionTag,
            splits: JSON.stringify(splits),
        },
        {optimisticData, successData, failureData},
    );
    Navigation.dismissModal(chatReportID);
    Report.notifyNewAction(chatReportID, sessionAccountID);
}

/**
 * @param {String} transactionID
 * @param {Object} transactionChanges
 */
function setDraftSplitTransaction(transactionID, transactionChanges = {}) {
    let draftSplitTransaction = allDraftSplitTransactions[`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`];

    if (!draftSplitTransaction) {
        draftSplitTransaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    }

    const updatedTransaction = TransactionUtils.getUpdatedTransaction(draftSplitTransaction, transactionChanges, false, false);

    Onyx.merge(`${ONYXKEYS.COLLECTION.SPLIT_TRANSACTION_DRAFT}${transactionID}`, updatedTransaction);
}

/**
 * @param {String} transactionID
 * @param {Number} transactionThreadReportID
 * @param {Object} transactionChanges
 */
function editRegularMoneyRequest(transactionID, transactionThreadReportID, transactionChanges) {
    // STEP 1: Get all collections we're updating
    const transactionThread = allReports[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`];
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const iouReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${transactionThread.parentReportID}`];
    const chatReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${iouReport.chatReportID}`];
    const isFromExpenseReport = ReportUtils.isExpenseReport(iouReport);

    // STEP 2: Build new modified expense report action.
    const updatedReportAction = ReportUtils.buildOptimisticModifiedExpenseReportAction(transactionThread, transaction, transactionChanges, isFromExpenseReport);
    const updatedTransaction = TransactionUtils.getUpdatedTransaction(transaction, transactionChanges, isFromExpenseReport);

    // STEP 3: Compute the IOU total and update the report preview message so LHN amount owed is correct
    // Should only update if the transaction matches the currency of the report, else we wait for the update
    // from the server with the currency conversion
    let updatedMoneyRequestReport = {...iouReport};
    const updatedChatReport = {...chatReport};
    const diff = TransactionUtils.getAmount(transaction, true) - TransactionUtils.getAmount(updatedTransaction, true);
    if (updatedTransaction.currency === iouReport.currency && updatedTransaction.modifiedAmount && diff !== 0) {
        if (ReportUtils.isExpenseReport(iouReport)) {
            updatedMoneyRequestReport.total += diff;
        } else {
            updatedMoneyRequestReport = IOUUtils.updateIOUOwnerAndTotal(iouReport, updatedReportAction.actorAccountID, diff, TransactionUtils.getCurrency(transaction), false);
        }

        updatedMoneyRequestReport.cachedTotal = CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedTransaction.currency);

        // Update the last message of the IOU report
        const lastMessage = ReportUtils.getIOUReportActionMessage(
            iouReport.reportID,
            CONST.IOU.REPORT_ACTION_TYPE.CREATE,
            updatedMoneyRequestReport.total,
            '',
            updatedTransaction.currency,
            '',
            false,
        );
        updatedMoneyRequestReport.lastMessageText = lastMessage[0].text;
        updatedMoneyRequestReport.lastMessageHtml = lastMessage[0].html;

        // Update the last message of the chat report
        const hasNonReimbursableTransactions = ReportUtils.hasNonReimbursableTransactions(iouReport);
        const messageText = Localize.translateLocal(hasNonReimbursableTransactions ? 'iou.payerSpentAmount' : 'iou.payerOwesAmount', {
            payer: ReportUtils.getPersonalDetailsForAccountID(updatedMoneyRequestReport.managerID).login || '',
            amount: CurrencyUtils.convertToDisplayString(updatedMoneyRequestReport.total, updatedMoneyRequestReport.currency),
        });
        updatedChatReport.lastMessageText = messageText;
        updatedChatReport.lastMessageHtml = messageText;
    }

    const isScanning = TransactionUtils.hasReceipt(updatedTransaction) && TransactionUtils.isReceiptBeingScanned(updatedTransaction);

    // STEP 4: Compose the optimistic data
    const currentTime = DateUtils.getDBTime();
    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: updatedReportAction,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: updatedTransaction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: updatedMoneyRequestReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.chatReportID}`,
            value: updatedChatReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
            value: {
                lastReadTime: currentTime,
                lastVisibleActionCreated: currentTime,
            },
        },
        ...(!isScanning
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
                      value: {
                          [transactionThread.parentReportActionID]: {
                              whisperedToAccountIDs: [],
                          },
                      },
                  },
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.parentReportID}`,
                      value: {
                          [iouReport.parentReportActionID]: {
                              whisperedToAccountIDs: [],
                          },
                      },
                  },
              ]
            : []),
    ];

    // Update recently used categories if the category is changed
    if (_.has(transactionChanges, 'category')) {
        const optimisticPolicyRecentlyUsedCategories = Policy.buildOptimisticPolicyRecentlyUsedCategories(iouReport.policyID, transactionChanges.category);
        if (!_.isEmpty(optimisticPolicyRecentlyUsedCategories)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.SET,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_CATEGORIES}${iouReport.policyID}`,
                value: optimisticPolicyRecentlyUsedCategories,
            });
        }
    }

    // Update recently used categories if the tag is changed
    if (_.has(transactionChanges, 'tag')) {
        const optimisticPolicyRecentlyUsedTags = Policy.buildOptimisticPolicyRecentlyUsedTags(iouReport.policyID, transactionChanges.tag);
        if (!_.isEmpty(optimisticPolicyRecentlyUsedTags)) {
            optimisticData.push({
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.POLICY_RECENTLY_USED_TAGS}${iouReport.policyID}`,
                value: optimisticPolicyRecentlyUsedTags,
            });
        }
    }

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {pendingAction: null},
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                pendingFields: {
                    comment: null,
                    amount: null,
                    created: null,
                    currency: null,
                    merchant: null,
                    billable: null,
                    category: null,
                    tag: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {pendingAction: null},
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThread.reportID}`,
            value: {
                [updatedReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericEditFailureMessage'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                ...transaction,
                modifiedCreated: transaction.modifiedCreated ? transaction.modifiedCreated : null,
                modifiedAmount: transaction.modifiedAmount ? transaction.modifiedAmount : null,
                modifiedCurrency: transaction.modifiedCurrency ? transaction.modifiedCurrency : null,
                modifiedMerchant: transaction.modifiedMerchant ? transaction.modifiedMerchant : null,
                modifiedWaypoints: transaction.modifiedWaypoints ? transaction.modifiedWaypoints : null,
                pendingFields: null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                ...iouReport,
                cachedTotal: iouReport.cachedTotal ? iouReport.cachedTotal : null,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.chatReportID}`,
            value: chatReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadReportID}`,
            value: {
                lastReadTime: transactionThread.lastReadTime,
                lastVisibleActionCreated: transactionThread.lastVisibleActionCreated,
            },
        },
    ];

    // STEP 6: Call the API endpoint
    const {created, amount, currency, comment, merchant, category, billable, tag} = ReportUtils.getTransactionDetails(updatedTransaction);
    API.write(
        'EditMoneyRequest',
        {
            transactionID,
            reportActionID: updatedReportAction.reportActionID,
            created,
            amount,
            currency,
            comment,
            merchant,
            category,
            billable,
            tag,
        },
        {optimisticData, successData, failureData},
    );
}

/**
 * @param {object} transaction
 * @param {String} transactionThreadReportID
 * @param {Object} transactionChanges
 */
function editMoneyRequest(transaction, transactionThreadReportID, transactionChanges) {
    if (TransactionUtils.isDistanceRequest(transaction)) {
        updateDistanceRequest(transaction.transactionID, transactionThreadReportID, transactionChanges);
    } else {
        editRegularMoneyRequest(transaction.transactionID, transactionThreadReportID, transactionChanges);
    }
}

/**
 * Updates the amount and currency fields of a money request
 *
 * @param {String} transactionID
 * @param {String} transactionThreadReportID
 * @param {String} currency
 * @param {Number} amount
 */
function updateMoneyRequestAmountAndCurrency(transactionID, transactionThreadReportID, currency, amount) {
    const transactionChanges = {
        amount,
        currency,
    };
    const {params, onyxData} = getUpdateMoneyRequestParams(transactionID, transactionThreadReportID, transactionChanges, true);
    API.write('UpdateMoneyRequestAmountAndCurrency', params, onyxData);
}

/**
 * @param {String | undefined} transactionID
 * @param {Object} reportAction - the money request reportAction we are deleting
 * @param {Boolean} isSingleTransactionView
 */
function deleteMoneyRequest(transactionID, reportAction, isSingleTransactionView = false) {
    // STEP 1: Get all collections we're updating
    const iouReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${reportAction.originalMessage.IOUReportID}`];
    const chatReport = allReports[`${ONYXKEYS.COLLECTION.REPORT}${iouReport.chatReportID}`];
    const reportPreviewAction = ReportActionsUtils.getReportPreviewAction(iouReport.chatReportID, iouReport.reportID);
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`];
    const transactionViolations = allTransactionViolations[`${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`];
    const transactionThreadID = reportAction.childReportID;
    let transactionThread = null;
    if (transactionThreadID) {
        transactionThread = allReports[`${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`];
    }

    // STEP 2: Decide if we need to:
    // 1. Delete the transactionThread - delete if there are no visible comments in the thread
    // 2. Update the moneyRequestPreview to show [Deleted request] - update if the transactionThread exists AND it isn't being deleted
    const shouldDeleteTransactionThread = transactionThreadID ? lodashGet(reportAction, 'childVisibleActionCount', 0) === 0 : false;
    const shouldShowDeletedRequestMessage = transactionThreadID && !shouldDeleteTransactionThread;

    // STEP 3: Update the IOU reportAction and decide if the iouReport should be deleted. We delete the iouReport if there are no visible comments left in the report.
    const updatedReportAction = {
        [reportAction.reportActionID]: {
            pendingAction: shouldShowDeletedRequestMessage ? CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE : CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            previousMessage: reportAction.message,
            message: [
                {
                    type: 'COMMENT',
                    html: '',
                    text: '',
                    isEdited: true,
                    isDeletedParentAction: shouldShowDeletedRequestMessage,
                },
            ],
            originalMessage: {
                IOUTransactionID: null,
            },
            errors: null,
        },
    };

    const lastVisibleAction = ReportActionsUtils.getLastVisibleAction(iouReport.reportID, updatedReportAction);
    const iouReportLastMessageText = ReportActionsUtils.getLastVisibleMessage(iouReport.reportID, updatedReportAction).lastMessageText;
    const shouldDeleteIOUReport =
        iouReportLastMessageText.length === 0 && !ReportActionsUtils.isDeletedParentAction(lastVisibleAction) && (!transactionThreadID || shouldDeleteTransactionThread);

    // STEP 4: Update the iouReport and reportPreview with new totals and messages if it wasn't deleted
    let updatedIOUReport = {...iouReport};
    const updatedReportPreviewAction = {...reportPreviewAction};
    updatedReportPreviewAction.pendingAction = shouldDeleteIOUReport ? CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE : CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE;
    if (ReportUtils.isExpenseReport(iouReport)) {
        updatedIOUReport = {...iouReport};

        // Because of the Expense reports are stored as negative values, we add the total from the amount
        updatedIOUReport.total += TransactionUtils.getAmount(transaction, true);
    } else {
        updatedIOUReport = IOUUtils.updateIOUOwnerAndTotal(
            iouReport,
            reportAction.actorAccountID,
            TransactionUtils.getAmount(transaction, false),
            TransactionUtils.getCurrency(transaction),
            true,
        );
    }

    updatedIOUReport.lastMessageText = iouReportLastMessageText;
    updatedIOUReport.lastVisibleActionCreated = lodashGet(lastVisibleAction, 'created');

    const hasNonReimbursableTransactions = ReportUtils.hasNonReimbursableTransactions(iouReport);
    const messageText = Localize.translateLocal(hasNonReimbursableTransactions ? 'iou.payerSpentAmount' : 'iou.payerOwesAmount', {
        payer: ReportUtils.getPersonalDetailsForAccountID(updatedIOUReport.managerID).login || '',
        amount: CurrencyUtils.convertToDisplayString(updatedIOUReport.total, updatedIOUReport.currency),
    });
    updatedReportPreviewAction.message[0].text = messageText;
    updatedReportPreviewAction.message[0].html = shouldDeleteIOUReport ? '' : messageText;

    if (reportPreviewAction.childMoneyRequestCount > 0) {
        updatedReportPreviewAction.childMoneyRequestCount = reportPreviewAction.childMoneyRequestCount - 1;
    }

    // STEP 5: Build Onyx data
    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: null,
        },
        ...(Permissions.canUseViolations(betas)
            ? [
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
                      value: null,
                  },
              ]
            : []),
        ...(shouldDeleteTransactionThread
            ? [
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                      value: null,
                  },
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${transactionThreadID}`,
                      value: null,
                  },
              ]
            : []),
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: updatedReportAction,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: updatedIOUReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: updatedReportPreviewAction,
            },
        },
        ...(!shouldDeleteIOUReport && updatedReportPreviewAction.childMoneyRequestCount === 0
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                      value: {
                          hasOutstandingChildRequest: false,
                      },
                  },
              ]
            : []),
        ...(shouldDeleteIOUReport
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                      value: {
                          hasOutstandingChildRequest: false,
                          iouReportID: null,
                          lastMessageText: ReportActionsUtils.getLastVisibleMessage(iouReport.chatReportID, {[reportPreviewAction.reportActionID]: null}).lastMessageText,
                          lastVisibleActionCreated: lodashGet(ReportActionsUtils.getLastVisibleAction(iouReport.chatReportID, {[reportPreviewAction.reportActionID]: null}), 'created'),
                      },
                  },
              ]
            : []),
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [reportAction.reportActionID]: shouldDeleteIOUReport
                    ? null
                    : {
                          pendingAction: null,
                      },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: shouldDeleteIOUReport
                    ? null
                    : {
                          pendingAction: null,
                          errors: null,
                      },
            },
        },
        ...(shouldDeleteIOUReport
            ? [
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
                      value: null,
                  },
              ]
            : []),
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: transaction,
        },
        ...(Permissions.canUseViolations(betas)
            ? [
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.TRANSACTION_VIOLATIONS}${transactionID}`,
                      value: transactionViolations,
                  },
              ]
            : []),
        ...(shouldDeleteTransactionThread
            ? [
                  {
                      onyxMethod: Onyx.METHOD.SET,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${transactionThreadID}`,
                      value: transactionThread,
                  },
              ]
            : []),
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [reportAction.reportActionID]: {
                    ...reportAction,
                    pendingAction: null,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericDeleteFailureMessage'),
                },
            },
        },
        {
            onyxMethod: shouldDeleteIOUReport ? Onyx.METHOD.SET : Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: iouReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    ...reportPreviewAction,
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.genericDeleteFailureMessage'),
                },
            },
        },
        ...(shouldDeleteIOUReport
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                      value: chatReport,
                  },
              ]
            : []),
        ...(!shouldDeleteIOUReport && updatedReportPreviewAction.childMoneyRequestCount === 0
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
                      value: {
                          hasOutstandingChildRequest: true,
                      },
                  },
              ]
            : []),
    ];

    // STEP 6: Make the API request
    API.write(
        'DeleteMoneyRequest',
        {
            transactionID,
            reportActionID: reportAction.reportActionID,
        },
        {optimisticData, successData, failureData},
    );

    // STEP 7: Navigate the user depending on which page they are on and which resources were deleted
    if (isSingleTransactionView && shouldDeleteTransactionThread && !shouldDeleteIOUReport) {
        // Pop the deleted report screen before navigating. This prevents navigating to the Concierge chat due to the missing report.
        Navigation.goBack(ROUTES.REPORT_WITH_ID.getRoute(iouReport.reportID));
        return;
    }

    if (shouldDeleteIOUReport) {
        // Pop the deleted report screen before navigating. This prevents navigating to the Concierge chat due to the missing report.
        Navigation.goBack(ROUTES.REPORT_WITH_ID.getRoute(iouReport.chatReportID));
    }
}

/**
 * @param {Object} report
 * @param {Number} amount
 * @param {String} currency
 * @param {String} comment
 * @param {String} paymentMethodType
 * @param {String} managerID - Account ID of the person sending the money
 * @param {Object} recipient - The user receiving the money
 * @returns {Object}
 */
function getSendMoneyParams(report, amount, currency, comment, paymentMethodType, managerID, recipient) {
    const recipientEmail = OptionsListUtils.addSMSDomainIfPhoneNumber(recipient.login);
    const recipientAccountID = Number(recipient.accountID);
    const newIOUReportDetails = JSON.stringify({
        amount,
        currency,
        requestorEmail: recipientEmail,
        requestorAccountID: recipientAccountID,
        comment,
        idempotencyKey: Str.guid(),
    });

    let chatReport = report.reportID ? report : null;
    let isNewChat = false;
    if (!chatReport) {
        chatReport = ReportUtils.getChatByParticipants([recipientAccountID]);
    }
    if (!chatReport) {
        chatReport = ReportUtils.buildOptimisticChatReport([recipientAccountID]);
        isNewChat = true;
    }
    const optimisticIOUReport = ReportUtils.buildOptimisticIOUReport(recipientAccountID, managerID, amount, chatReport.reportID, currency, true);

    const optimisticTransaction = TransactionUtils.buildOptimisticTransaction(amount, currency, optimisticIOUReport.reportID, comment);
    const optimisticTransactionData = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
        value: optimisticTransaction,
    };

    // Note: The created action must be optimistically generated before the IOU action so there's no chance that the created action appears after the IOU action in the chat
    const optimisticCreatedAction = ReportUtils.buildOptimisticCreatedReportAction(recipientEmail);
    const optimisticIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.PAY,
        amount,
        currency,
        comment,
        [recipient],
        optimisticTransaction.transactionID,
        paymentMethodType,
        optimisticIOUReport.reportID,
        false,
        true,
    );

    const reportPreviewAction = ReportUtils.buildOptimisticReportPreview(chatReport, optimisticIOUReport);

    // First, add data that will be used in all cases
    const optimisticChatReportData = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
        value: {
            ...chatReport,
            lastReadTime: DateUtils.getDBTime(),
            lastVisibleActionCreated: reportPreviewAction.created,
        },
    };
    const optimisticIOUReportData = {
        onyxMethod: Onyx.METHOD.SET,
        key: `${ONYXKEYS.COLLECTION.REPORT}${optimisticIOUReport.reportID}`,
        value: {
            ...optimisticIOUReport,
            lastMessageText: optimisticIOUReportAction.message[0].text,
            lastMessageHtml: optimisticIOUReportAction.message[0].html,
        },
    };
    const optimisticIOUReportActionsData = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
        value: {
            [optimisticIOUReportAction.reportActionID]: {
                ...optimisticIOUReportAction,
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticChatReportActionsData = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
        value: {
            [reportPreviewAction.reportActionID]: reportPreviewAction,
        },
    };

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {pendingAction: null},
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [reportPreviewAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${optimisticTransaction.transactionID}`,
            value: {
                errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
            },
        },
    ];

    let optimisticPersonalDetailListData = {};

    // Now, let's add the data we need just when we are creating a new chat report
    if (isNewChat) {
        // Change the method to set for new reports because it doesn't exist yet, is faster,
        // and we need the data to be available when we navigate to the chat page
        optimisticChatReportData.onyxMethod = Onyx.METHOD.SET;
        optimisticIOUReportData.onyxMethod = Onyx.METHOD.SET;

        // Set and clear pending fields on the chat report
        optimisticChatReportData.value.pendingFields = {createChat: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD};
        successData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: optimisticChatReportData.key,
            value: {pendingFields: null},
        });
        failureData.push(
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: optimisticChatReportData.key,
                value: {
                    errorFields: {
                        createChat: ErrorUtils.getMicroSecondOnyxError('report.genericCreateReportFailureMessage'),
                    },
                },
            },
            {
                onyxMethod: Onyx.METHOD.MERGE,
                key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
                value: {
                    [optimisticIOUReportAction.reportActionID]: {
                        errors: ErrorUtils.getMicroSecondOnyxError(null),
                    },
                },
            },
        );

        // Add optimistic personal details for recipient
        optimisticPersonalDetailListData = {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.PERSONAL_DETAILS_LIST,
            value: {
                [recipientAccountID]: {
                    accountID: recipientAccountID,
                    avatar: UserUtils.getDefaultAvatarURL(recipient.accountID),
                    displayName: recipient.displayName || recipient.login,
                    login: recipient.login,
                },
            },
        };

        // Add an optimistic created action to the optimistic chat reportActions data
        optimisticChatReportActionsData.value[optimisticCreatedAction.reportActionID] = optimisticCreatedAction;
    } else {
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${optimisticIOUReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        });
    }

    const optimisticData = [optimisticChatReportData, optimisticIOUReportData, optimisticChatReportActionsData, optimisticIOUReportActionsData, optimisticTransactionData];
    if (!_.isEmpty(optimisticPersonalDetailListData)) {
        optimisticData.push(optimisticPersonalDetailListData);
    }

    return {
        params: {
            iouReportID: optimisticIOUReport.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
            transactionID: optimisticTransaction.transactionID,
            newIOUReportDetails,
            createdReportActionID: isNewChat ? optimisticCreatedAction.reportActionID : 0,
            reportPreviewReportActionID: reportPreviewAction.reportActionID,
        },
        optimisticData,
        successData,
        failureData,
    };
}

/**
 * @param {Object} chatReport
 * @param {Object} iouReport
 * @param {Object} recipient
 * @param {String} paymentMethodType
 * @returns {Object}
 */
function getPayMoneyRequestParams(chatReport, iouReport, recipient, paymentMethodType) {
    const optimisticIOUReportAction = ReportUtils.buildOptimisticIOUReportAction(
        CONST.IOU.REPORT_ACTION_TYPE.PAY,
        -iouReport.total,
        iouReport.currency,
        '',
        [recipient],
        '',
        paymentMethodType,
        iouReport.reportID,
        true,
    );

    // In some instances, the report preview action might not be available to the payer (only whispered to the requestor)
    // hence we need to make the updates to the action safely.
    let optimisticReportPreviewAction = null;
    const reportPreviewAction = ReportActionsUtils.getReportPreviewAction(chatReport.reportID, iouReport.reportID);
    if (reportPreviewAction) {
        optimisticReportPreviewAction = ReportUtils.updateReportPreview(iouReport, reportPreviewAction, true);
    }

    const currentNextStep = lodashGet(allNextSteps, `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`, null);

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: {
                ...chatReport,
                lastReadTime: DateUtils.getDBTime(),
                lastVisibleActionCreated: optimisticIOUReportAction.created,
                hasOutstandingChildRequest: false,
                iouReportID: null,
                lastMessageText: optimisticIOUReportAction.message[0].text,
                lastMessageHtml: optimisticIOUReportAction.message[0].html,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    ...optimisticIOUReportAction,
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: {
                ...iouReport,
                lastMessageText: optimisticIOUReportAction.message[0].text,
                lastMessageHtml: optimisticIOUReportAction.message[0].html,
                hasOutstandingChildRequest: false,
                statusNum: CONST.REPORT.STATUS_NUM.REIMBURSED,
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: ONYXKEYS.NVP_LAST_PAYMENT_METHOD,
            value: {[iouReport.policyID]: paymentMethodType},
        },
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${iouReport.reportID}`,
            value: {
                [optimisticIOUReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${iouReport.reportID}`,
            value: iouReport,
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${chatReport.reportID}`,
            value: chatReport,
        },
    ];

    if (!_.isNull(currentNextStep)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${iouReport.reportID}`,
            value: currentNextStep,
        });
    }

    // In case the report preview action is loaded locally, let's update it.
    if (optimisticReportPreviewAction) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: optimisticReportPreviewAction,
            },
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${chatReport.reportID}`,
            value: {
                [optimisticReportPreviewAction.reportActionID]: {
                    created: optimisticReportPreviewAction.created,
                },
            },
        });
    }

    return {
        params: {
            iouReportID: iouReport.reportID,
            chatReportID: chatReport.reportID,
            reportActionID: optimisticIOUReportAction.reportActionID,
            paymentMethodType,
        },
        optimisticData,
        successData,
        failureData,
    };
}

/**
 * @param {Object} report
 * @param {Number} amount
 * @param {String} currency
 * @param {String} comment
 * @param {String} managerID - Account ID of the person sending the money
 * @param {Object} recipient - The user receiving the money
 */
function sendMoneyElsewhere(report, amount, currency, comment, managerID, recipient) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.ELSEWHERE, managerID, recipient);

    API.write('SendMoneyElsewhere', params, {optimisticData, successData, failureData});

    resetMoneyRequestInfo();
    Navigation.dismissModal(params.chatReportID);
    Report.notifyNewAction(params.chatReportID, managerID);
}

/**
 * @param {Object} report
 * @param {Number} amount
 * @param {String} currency
 * @param {String} comment
 * @param {String} managerID - Account ID of the person sending the money
 * @param {Object} recipient - The user receiving the money
 */
function sendMoneyWithWallet(report, amount, currency, comment, managerID, recipient) {
    const {params, optimisticData, successData, failureData} = getSendMoneyParams(report, amount, currency, comment, CONST.IOU.PAYMENT_TYPE.EXPENSIFY, managerID, recipient);

    API.write('SendMoneyWithWallet', params, {optimisticData, successData, failureData});

    resetMoneyRequestInfo();
    Navigation.dismissModal(params.chatReportID);
    Report.notifyNewAction(params.chatReportID, managerID);
}

function approveMoneyRequest(expenseReport) {
    const currentNextStep = lodashGet(allNextSteps, `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`, null);

    const optimisticApprovedReportAction = ReportUtils.buildOptimisticApprovedReportAction(expenseReport.total, expenseReport.currency, expenseReport.reportID);

    const optimisticReportActionsData = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
        value: {
            [optimisticApprovedReportAction.reportActionID]: {
                ...optimisticApprovedReportAction,
                pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
            },
        },
    };
    const optimisticIOUReportData = {
        onyxMethod: Onyx.METHOD.MERGE,
        key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
        value: {
            ...expenseReport,
            lastMessageText: optimisticApprovedReportAction.message[0].text,
            lastMessageHtml: optimisticApprovedReportAction.message[0].html,
            stateNum: CONST.REPORT.STATE_NUM.APPROVED,
            statusNum: CONST.REPORT.STATUS_NUM.APPROVED,
        },
    };
    const optimisticData = [optimisticIOUReportData, optimisticReportActionsData];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticApprovedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [expenseReport.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
    ];

    if (!_.isNull(currentNextStep)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        });
    }

    API.write('ApproveMoneyRequest', {reportID: expenseReport.reportID, approvedReportActionID: optimisticApprovedReportAction.reportActionID}, {optimisticData, successData, failureData});
}

/**
 * @param {Object} expenseReport
 */
function submitReport(expenseReport) {
    const currentNextStep = lodashGet(allNextSteps, `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`, null);

    const optimisticSubmittedReportAction = ReportUtils.buildOptimisticSubmittedReportAction(expenseReport.total, expenseReport.currency, expenseReport.reportID);
    const parentReport = ReportUtils.getReport(expenseReport.parentReportID);
    const policy = ReportUtils.getPolicy(expenseReport.policyID);
    const isCurrentUserManager = currentUserPersonalDetails.accountID === expenseReport.managerID;

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    ...optimisticSubmittedReportAction,
                    pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.ADD,
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                ...expenseReport,
                lastMessageText: lodashGet(optimisticSubmittedReportAction, 'message.0.text', ''),
                lastMessageHtml: lodashGet(optimisticSubmittedReportAction, 'message.0.html', ''),
                stateNum: CONST.REPORT.STATE_NUM.SUBMITTED,
                statusNum: CONST.REPORT.STATUS_NUM.SUBMITTED,
            },
        },
        ...(parentReport.reportID
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
                      value: {
                          ...parentReport,

                          // In case its a manager who force submitted the report, they are the next user who needs to take an action
                          hasOutstandingChildRequest: isCurrentUserManager,
                          iouReportID: null,
                      },
                  },
              ]
            : []),
    ];

    const successData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    pendingAction: null,
                },
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT_ACTIONS}${expenseReport.reportID}`,
            value: {
                [optimisticSubmittedReportAction.reportActionID]: {
                    errors: ErrorUtils.getMicroSecondOnyxError('iou.error.other'),
                },
            },
        },
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.REPORT}${expenseReport.reportID}`,
            value: {
                statusNum: CONST.REPORT.STATUS_NUM.OPEN,
                stateNum: CONST.REPORT.STATE_NUM.OPEN,
            },
        },
        ...(parentReport.reportID
            ? [
                  {
                      onyxMethod: Onyx.METHOD.MERGE,
                      key: `${ONYXKEYS.COLLECTION.REPORT}${parentReport.reportID}`,
                      value: {
                          hasOutstandingChildRequest: parentReport.hasOutstandingChildRequest,
                          iouReportID: expenseReport.reportID,
                      },
                  },
              ]
            : []),
    ];

    if (!_.isNull(currentNextStep)) {
        optimisticData.push({
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: null,
        });
        failureData.push({
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.NEXT_STEP}${expenseReport.reportID}`,
            value: currentNextStep,
        });
    }

    API.write(
        'SubmitReport',
        {
            reportID: expenseReport.reportID,
            managerAccountID: policy.submitsTo || expenseReport.managerID,
            reportActionID: optimisticSubmittedReportAction.reportActionID,
        },
        {optimisticData, successData, failureData},
    );
}

/**
 * @param {String} paymentType
 * @param {Object} chatReport
 * @param {Object} iouReport
 * @param {String} reimbursementBankAccountState
 */
function payMoneyRequest(paymentType, chatReport, iouReport) {
    const recipient = {accountID: iouReport.ownerAccountID};
    const {params, optimisticData, successData, failureData} = getPayMoneyRequestParams(chatReport, iouReport, recipient, paymentType);

    // For now we need to call the PayMoneyRequestWithWallet API since PayMoneyRequest was not updated to work with
    // Expensify Wallets.
    const apiCommand = paymentType === CONST.IOU.PAYMENT_TYPE.EXPENSIFY ? 'PayMoneyRequestWithWallet' : 'PayMoneyRequest';

    API.write(apiCommand, params, {optimisticData, successData, failureData});
    Navigation.dismissModal(chatReport.reportID);
}

function detachReceipt(transactionID) {
    const transaction = allTransactions[`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`] || {};
    const newTransaction = {...transaction, filename: '', receipt: {}};

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.SET,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: newTransaction,
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: transaction,
        },
    ];

    API.write('DetachReceipt', {transactionID}, {optimisticData, failureData});
}

/**
 * @param {String} transactionID
 * @param {Object} file
 * @param {String} source
 */
function replaceReceipt(transactionID, file, source) {
    const transaction = lodashGet(allTransactions, 'transactionID', {});
    const oldReceipt = lodashGet(transaction, 'receipt', {});

    const optimisticData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: {
                    source,
                    state: CONST.IOU.RECEIPT_STATE.OPEN,
                },
                filename: file.name,
            },
        },
    ];

    const failureData = [
        {
            onyxMethod: Onyx.METHOD.MERGE,
            key: `${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`,
            value: {
                receipt: oldReceipt,
                filename: transaction.filename,
            },
        },
    ];

    API.write('ReplaceReceipt', {transactionID, receipt: file}, {optimisticData, failureData});
}

/**
 * Finds the participants for an IOU based on the attached report
 * @param {String} transactionID of the transaction to set the participants of
 * @param {Object} report attached to the transaction
 */
function setMoneyRequestParticipantsFromReport(transactionID, report) {
    // If the report is iou or expense report, we should get the chat report to set participant for request money
    const chatReport = ReportUtils.isMoneyRequestReport(report) ? ReportUtils.getReport(report.chatReportID) : report;
    const currentUserAccountID = currentUserPersonalDetails.accountID;
    const participants = ReportUtils.isPolicyExpenseChat(chatReport)
        ? [{reportID: chatReport.reportID, isPolicyExpenseChat: true, selected: true}]
        : _.chain(chatReport.participantAccountIDs)
              .filter((accountID) => currentUserAccountID !== accountID)
              .map((accountID) => ({accountID, selected: true}))
              .value();
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {participants, participantsAutoAssigned: true});
}

/**
 * Initialize money request info and navigate to the MoneyRequest page
 * @param {String} iouType
 * @param {String} reportID
 */
function startMoneyRequest(iouType, reportID = '') {
    resetMoneyRequestInfo(`${iouType}${reportID}`);
    Navigation.navigate(ROUTES.MONEY_REQUEST.getRoute(iouType, reportID));
}

/**
 * @param {String} id
 */
function setMoneyRequestId(id) {
    Onyx.merge(ONYXKEYS.IOU, {id});
}

/**
 * @param {Number} amount
 */
function setMoneyRequestAmount(amount) {
    Onyx.merge(ONYXKEYS.IOU, {amount});
}

/**
 * @param {String} created
 */
function setMoneyRequestCreated(created) {
    Onyx.merge(ONYXKEYS.IOU, {created});
}

/**
 * @param {String} currency
 */
function setMoneyRequestCurrency(currency) {
    Onyx.merge(ONYXKEYS.IOU, {currency});
}

/**
 * @param {String} comment
 */
function setMoneyRequestDescription(comment) {
    Onyx.merge(ONYXKEYS.IOU, {comment: comment.trim()});
}

/**
 * @param {String} merchant
 */
function setMoneyRequestMerchant(merchant) {
    Onyx.merge(ONYXKEYS.IOU, {merchant: merchant.trim()});
}

/**
 * @param {String} category
 */
function setMoneyRequestCategory(category) {
    Onyx.merge(ONYXKEYS.IOU, {category});
}

function resetMoneyRequestCategory() {
    Onyx.merge(ONYXKEYS.IOU, {category: ''});
}

/*
 * @param {String} tag
 */
function setMoneyRequestTag(tag) {
    Onyx.merge(ONYXKEYS.IOU, {tag});
}

function resetMoneyRequestTag() {
    Onyx.merge(ONYXKEYS.IOU, {tag: ''});
}

/**
 * @param {String} transactionID
 * @param {Object} taxRate
 */
function setMoneyRequestTaxRate(transactionID, taxRate) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxRate});
}

/**
 * @param {String} transactionID
 * @param {Number} taxAmount
 */
function setMoneyRequestTaxAmount(transactionID, taxAmount) {
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION_DRAFT}${transactionID}`, {taxAmount});
}

/**
 * @param {Boolean} billable
 */
function setMoneyRequestBillable(billable) {
    Onyx.merge(ONYXKEYS.IOU, {billable});
}

/**
 * @param {Object[]} participants
 * @param {Boolean} isSplitRequest
 */
function setMoneyRequestParticipants(participants, isSplitRequest) {
    Onyx.merge(ONYXKEYS.IOU, {participants, isSplitRequest});
}

function setUpDistanceTransaction() {
    const transactionID = NumberUtils.rand64();
    Onyx.merge(`${ONYXKEYS.COLLECTION.TRANSACTION}${transactionID}`, {
        transactionID,
        comment: {type: CONST.TRANSACTION.TYPE.CUSTOM_UNIT, customUnit: {name: CONST.CUSTOM_UNITS.NAME_DISTANCE}},
    });
    Onyx.merge(ONYXKEYS.IOU, {transactionID});
}

/**
 * Navigates to the next IOU page based on where the IOU request was started
 *
 * @param {Object} iou
 * @param {String} iouType
 * @param {Object} report
 * @param {String} report.reportID
 * @param {String} path
 */
function navigateToNextPage(iou, iouType, report, path = '') {
    const moneyRequestID = `${iouType}${report.reportID || ''}`;
    const shouldReset = iou.id !== moneyRequestID && !_.isEmpty(report.reportID);

    // If the money request ID in Onyx does not match the ID from params, we want to start a new request
    // with the ID from params. We need to clear the participants in case the new request is initiated from FAB.
    if (shouldReset) {
        resetMoneyRequestInfo(moneyRequestID);
    }

    // If we're adding a receipt, that means the user came from the confirmation page and we need to navigate back to it.
    if (path.slice(1) === ROUTES.MONEY_REQUEST_RECEIPT.getRoute(iouType, report.reportID)) {
        Navigation.navigate(ROUTES.MONEY_REQUEST_CONFIRMATION.getRoute(iouType, report.reportID));
        return;
    }

    // If a request is initiated on a report, skip the participants selection step and navigate to the confirmation page.
    if (report.reportID) {
        // If the report is iou or expense report, we should get the chat report to set participant for request money
        const chatReport = ReportUtils.isMoneyRequestReport(report) ? ReportUtils.getReport(report.chatReportID) : report;
        // Reinitialize the participants when the money request ID in Onyx does not match the ID from params
        if (_.isEmpty(iou.participants) || shouldReset) {
            const currentUserAccountID = currentUserPersonalDetails.accountID;
            const participants = ReportUtils.isPolicyExpenseChat(chatReport)
                ? [{reportID: chatReport.reportID, isPolicyExpenseChat: true, selected: true}]
                : _.chain(chatReport.participantAccountIDs)
                      .filter((accountID) => currentUserAccountID !== accountID)
                      .map((accountID) => ({accountID, selected: true}))
                      .value();
            setMoneyRequestParticipants(participants);
            resetMoneyRequestCategory();
            resetMoneyRequestTag();
        }
        Navigation.navigate(ROUTES.MONEY_REQUEST_CONFIRMATION.getRoute(iouType, report.reportID));
        return;
    }
    Navigation.navigate(ROUTES.MONEY_REQUEST_PARTICIPANTS.getRoute(iouType));
}

/**
 *  When the money request or split bill creation flow is initialized via FAB, the reportID is not passed as a navigation
 * parameter.
 * Gets a report id from the first participant of the IOU object stored in Onyx.
 * @param {Object} iou
 * @param {Array} iou.participants
 * @param {Object} route
 * @param {Object} route.params
 * @param {String} [route.params.reportID]
 * @returns {String}
 */
function getIOUReportID(iou, route) {
    return lodashGet(route, 'params.reportID') || lodashGet(iou, 'participants.0.reportID', '');
}

/**
 * @param {String} receiptFilename
 * @param {String} receiptPath
 * @param {Function} onSuccess
 * @param {String} requestType
 * @param {String} iouType
 * @param {String} transactionID
 * @param {String} reportID
 */
// eslint-disable-next-line rulesdir/no-negated-variables
function navigateToStartStepIfScanFileCannotBeRead(receiptFilename, receiptPath, onSuccess, requestType, iouType, transactionID, reportID) {
    if (!receiptFilename || !receiptPath) {
        return;
    }

    const onFailure = () => {
        setMoneyRequestReceipt(transactionID, '', '', true);
        if (requestType === CONST.IOU.REQUEST_TYPE.MANUAL) {
            Navigation.navigate(ROUTES.MONEY_REQUEST_STEP_SCAN.getRoute(CONST.IOU.ACTION.CREATE, iouType, transactionID, reportID, Navigation.getActiveRouteWithoutParams()));
            return;
        }
        IOUUtils.navigateToStartMoneyRequestStep(requestType, iouType, transactionID, reportID);
    };
    FileUtils.readFileAsync(receiptPath, receiptFilename, onSuccess, onFailure);
}

export {
    setMoneyRequestParticipants,
    createDistanceRequest,
    deleteMoneyRequest,
    splitBill,
    splitBillAndOpenReport,
    setDraftSplitTransaction,
    startSplitBill,
    completeSplitBill,
    requestMoney,
    sendMoneyElsewhere,
    approveMoneyRequest,
    submitReport,
    payMoneyRequest,
    sendMoneyWithWallet,
    startMoneyRequest,
    startMoneyRequest_temporaryForRefactor,
    resetMoneyRequestCategory,
    resetMoneyRequestCategory_temporaryForRefactor,
    resetMoneyRequestInfo,
    resetMoneyRequestTag,
    resetMoneyRequestTag_temporaryForRefactor,
    clearMoneyRequest,
    setMoneyRequestAmount_temporaryForRefactor,
    setMoneyRequestBillable_temporaryForRefactor,
    setMoneyRequestCategory_temporaryForRefactor,
    setMoneyRequestCreated_temporaryForRefactor,
    setMoneyRequestCurrency_temporaryForRefactor,
    setMoneyRequestDescription_temporaryForRefactor,
    setMoneyRequestMerchant_temporaryForRefactor,
    setMoneyRequestParticipants_temporaryForRefactor,
    setMoneyRequestReceipt,
    setMoneyRequestTag_temporaryForRefactor,
    setMoneyRequestAmount,
    setMoneyRequestBillable,
    setMoneyRequestCategory,
    setMoneyRequestCreated,
    setMoneyRequestCurrency,
    setMoneyRequestDescription,
    setMoneyRequestId,
    setMoneyRequestMerchant,
    setMoneyRequestParticipantsFromReport,
    setMoneyRequestTag,
    setMoneyRequestTaxAmount,
    setMoneyRequestTaxRate,
    setUpDistanceTransaction,
    navigateToNextPage,
    updateMoneyRequestDate,
    updateMoneyRequestBillable,
    updateMoneyRequestMerchant,
    updateMoneyRequestTag,
    updateMoneyRequestDistance,
    updateMoneyRequestCategory,
    updateMoneyRequestAmountAndCurrency,
    updateMoneyRequestDescription,
    replaceReceipt,
    detachReceipt,
    getIOUReportID,
    editMoneyRequest,
    navigateToStartStepIfScanFileCannotBeRead,
};
