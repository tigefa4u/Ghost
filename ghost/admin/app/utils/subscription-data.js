import moment from 'moment-timezone';
import {getNonDecimal, getSymbol} from 'ghost-admin/utils/currency';

export function getSubscriptionData(sub) {
    const data = {
        ...sub,
        attribution: {
            ...sub.attribution,
            referrerSource: sub.attribution?.referrer_source || 'Unknown',
            referrerMedium: sub.attribution?.referrer_medium || '-'
        },
        startDate: sub.start_date ? moment(sub.start_date).format('D MMM YYYY') : '-',
        validUntil: validUntil(sub),
        hasEnded: isCanceled(sub),
        willEndSoon: isSetToCancel(sub),
        cancellationReason: sub.cancellation_reason,
        price: {
            ...sub.price,
            currencySymbol: getSymbol(sub.price.currency),
            nonDecimalAmount: getNonDecimal(sub.price.amount)
        },
        isComplimentary: isComplimentary(sub),
        compExpiry: compExpiry(sub),
        trialUntil: trialUntil(sub)
    };

    data.priceLabel = priceLabel(data);
    data.validityDetails = validityDetails(data, !!data.priceLabel);

    // Offer display
    if (data.offer) {
        data.offerLabel = offerLabel(data.offer);
        data.offerDetails = offerDetails(data.offer, data.next_payment);
    }

    // Discounted price from next_payment
    const discount = discountPrice(sub);
    if (discount) {
        data.hasActiveDiscount = true;
        data.discountedPrice = discount.discountedPrice;
        data.originalPrice = discount.originalPrice;
    }

    return data;
}

export function validUntil(sub) {
    // If a subscription has been canceled immediately, don't render the end of validity date
    // Reason: we don't store the exact cancelation date in the subscription object
    if (sub.status === 'canceled' && !sub.cancel_at_period_end) {
        return '';
    }

    // Otherwise, show the current period end date
    if (sub.current_period_end) {
        return moment(sub.current_period_end).format('D MMM YYYY');
    }

    return '';
}

export function isActive(sub) {
    return ['active', 'trialing', 'past_due', 'unpaid'].includes(sub.status);
}

export function isComplimentary(sub) {
    return !sub.id;
}

export function isCanceled(sub) {
    return sub.status === 'canceled';
}

export function isSetToCancel(sub) {
    return sub.cancel_at_period_end && isActive(sub);
}

export function compExpiry(sub) {
    if (!sub.id && sub.tier && sub.tier.expiry_at) {
        return moment(sub.tier.expiry_at).utc().format('D MMM YYYY');
    }

    return undefined;
}

export function trialUntil(sub) {
    const offer = sub.offer;
    const isTrial = !offer || offer?.type === 'trial';
    const isTrialActive = isTrial && sub.trial_end_at && moment(sub.trial_end_at).isAfter(new Date(), 'day');

    if (isTrialActive) {
        return moment(sub.trial_end_at).format('D MMM YYYY');
    }

    return undefined;
}

export function validityDetails(data, separatorNeeded = false) {
    const separator = separatorNeeded ? ' – ' : '';
    const space = data.validUntil ? ' ' : '';

    if (data.isComplimentary) {
        if (data.compExpiry) {
            return `${separator}Expires ${data.compExpiry}`;
        } else {
            return '';
        }
    }

    if (data.hasEnded) {
        return `${separator}Ended${space}${data.validUntil}`;
    }

    if (data.willEndSoon) {
        return `${separator}Has access until${space}${data.validUntil}`;
    }

    if (data.trialUntil) {
        return `${separator}Ends ${data.trialUntil}`;
    }

    return `${separator}Renews${space}${data.validUntil}`;
}

export function priceLabel(data) {
    if (data.trialUntil) {
        return 'Free trial';
    }

    if (data.price.nickname && data.price.nickname.length > 0 && data.price.nickname !== 'Monthly' && data.price.nickname !== 'Yearly') {
        return data.price.nickname;
    }
}

export function offerLabel(offer) {
    if (offer.redemption_type === 'retention') {
        return 'Retention offer';
    }
    return 'Signup offer';
}

export function offerDetails(offer, nextPayment) {
    const isRetention = offer.redemption_type === 'retention';

    if (isRetention) {
        return retentionOfferDetails(offer, nextPayment);
    }

    return signupOfferDetails(offer);
}

function signupOfferDetails(offer) {
    if (offer.type === 'trial') {
        return `${offer.name} (${offer.amount} days free)`;
    }

    if (offer.type === 'free_months') {
        const monthText = offer.amount === 1 ? 'month' : 'months';
        return `${offer.name} (${offer.amount} ${monthText} free)`;
    }

    if (offer.type === 'fixed') {
        return `${offer.name} (${getSymbol(offer.currency)}${getNonDecimal(offer.amount)} off)`;
    }

    // percent
    return `${offer.name} (${offer.amount}% off)`;
}

function retentionOfferDetails(offer, nextPayment) {
    let discountText;

    if (offer.type === 'fixed') {
        discountText = `${getSymbol(offer.currency)}${getNonDecimal(offer.amount)} off`;
    } else if (offer.type === 'percent') {
        discountText = `${offer.amount}% off`;
    } else if (offer.type === 'free_months') {
        const monthText = offer.amount === 1 ? 'month' : 'months';
        discountText = `${offer.amount} ${monthText} free`;
    } else {
        discountText = `${offer.amount} days free`;
    }

    // Add end date if available from discount info
    if (nextPayment?.discount?.end) {
        const endDate = moment(nextPayment.discount.end).format('MMM YYYY');
        return `${discountText} until ${endDate}`;
    }

    return discountText;
}

export function discountPrice(sub) {
    if (!sub.next_payment || !sub.next_payment.discount) {
        return null;
    }

    if (sub.next_payment.amount === sub.next_payment.original_amount) {
        return null;
    }

    return {
        discountedPrice: {
            currencySymbol: getSymbol(sub.next_payment.currency),
            nonDecimalAmount: getNonDecimal(sub.next_payment.amount)
        },
        originalPrice: {
            currencySymbol: getSymbol(sub.next_payment.currency),
            nonDecimalAmount: getNonDecimal(sub.next_payment.original_amount)
        }
    };
}
