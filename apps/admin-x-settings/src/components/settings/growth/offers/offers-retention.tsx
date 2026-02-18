import {useRouting} from '@tryghost/admin-x-framework/routing';

// TODO: Replace placeholder data with real retention offer data from API

type RetentionOffer = {
    id: string;
    name: string;
    description: string;
    terms: string | null; // e.g. "50% OFF" when active
    termsDetail: string | null; // e.g. "Next payment" when active
    redemptions: number;
    status: 'active' | 'inactive';
};

const placeholderRetentionOffers: RetentionOffer[] = [
    {
        id: 'monthly',
        name: 'Monthly retention',
        description: 'Applied to monthly plans',
        terms: '50% OFF',
        termsDetail: 'Next payment',
        redemptions: 3,
        status: 'active'
    },
    {
        id: 'yearly',
        name: 'Yearly retention',
        description: 'Applied to annual plans',
        terms: null,
        termsDetail: null,
        redemptions: 0,
        status: 'inactive'
    }
];

const OffersRetention: React.FC = () => {
    const {updateRoute} = useRouting();

    const handleRetentionOfferClick = (id: string) => {
        updateRoute(`offers/edit/retention/${id}`);
    };

    return (
        <div className='overflow-x-auto'>
            <table className='m-0 w-full table-fixed'>
                <colgroup>
                    <col />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[220px]' />
                    <col className='w-[80px]' />
                </colgroup>
                {placeholderRetentionOffers.map(offer => (
                    <tr key={offer.id} className='group relative scale-100 border-b border-b-grey-100 dark:border-b-grey-950' data-testid='retention-offer-item'>
                        <td className='p-0'>
                            <a className='block cursor-pointer p-5 pl-0' onClick={() => handleRetentionOfferClick(offer.id)}>
                                <span className='font-semibold'>{offer.name}</span><br />
                                <span className='text-sm text-grey-700'>{offer.description}</span>
                            </a>
                        </td>
                        <td className='whitespace-nowrap p-0 text-sm'>
                            <a className='block cursor-pointer p-5' onClick={() => handleRetentionOfferClick(offer.id)}>
                                {offer.terms ? (
                                    <>
                                        <span className='text-[1.3rem] font-medium uppercase'>{offer.terms}</span><br />
                                        <span className='text-grey-700'>{offer.termsDetail}</span>
                                    </>
                                ) : (
                                    <span className='text-grey-700'>&ndash;</span>
                                )}
                            </a>
                        </td>
                        <td className='whitespace-nowrap p-0 text-sm'>
                            <a className='block cursor-pointer p-5' onClick={() => handleRetentionOfferClick(offer.id)}>
                                {offer.redemptions}
                            </a>
                        </td>
                        <td className='whitespace-nowrap p-0 text-sm'>
                            <a className='block cursor-pointer p-5' onClick={() => handleRetentionOfferClick(offer.id)}>
                                {offer.status === 'active' ? (
                                    <span className='inline-flex items-center rounded-full bg-[rgba(48,207,67,0.15)] px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-green'>Active</span>
                                ) : (
                                    <span className='inline-flex items-center rounded-full bg-grey-200 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-grey-700 dark:bg-grey-900 dark:text-grey-500'>Inactive</span>
                                )}
                            </a>
                        </td>
                        <td className='w-[80px] p-0'></td>
                    </tr>
                ))}
            </table>
        </div>
    );
};

export default OffersRetention;
