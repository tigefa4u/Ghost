import React, {ReactNode} from 'react';
import clsx from 'clsx';
import {EditableItem, NavigationItem, NavigationItemErrors} from '../../../../hooks/site/useNavigationEditor';
import {TextField, URLTextField, formatUrl} from '@tryghost/admin-x-design-system';

export type NavigationItemEditorProps = React.HTMLAttributes<HTMLDivElement> & {
    baseUrl: string;
    item: EditableItem;
    clearError?: (key: keyof NavigationItemErrors) => void;
    updateItem?: (item: Partial<NavigationItem>) => void;
    labelPlaceholder?: string
    unstyled?: boolean
    textFieldClasses?: string
    action?: ReactNode
    addItem?: () => void
}

const NavigationItemEditor: React.FC<NavigationItemEditorProps> = ({baseUrl, item, updateItem, addItem, clearError, labelPlaceholder, unstyled, textFieldClasses, action, className, ...props}) => {
    return (
        <div className={clsx('flex w-full items-start gap-3', className)} data-testid='navigation-item-editor' {...props}>
            <div className="flex flex-1 pt-1">
                <TextField
                    className={textFieldClasses}
                    containerClassName="grow"
                    error={!!item.errors.label}
                    hint={item.errors.label}
                    placeholder={labelPlaceholder}
                    title='Label'
                    unstyled={unstyled}
                    value={item.label}
                    hideTitle
                    onChange={e => updateItem?.({label: e.target.value})}
                    onKeyDown={(e) => {
                        updateItem?.({label: (e.target as HTMLInputElement).value});
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            addItem?.();
                        }
                        !!item.errors.label && clearError?.('label');
                    }}
                />
            </div>
            <div className="flex flex-1 pt-1">
                <URLTextField
                    baseUrl={baseUrl}
                    className={textFieldClasses}
                    containerClassName="grow"
                    error={!!item.errors.url}
                    hint={item.errors.url}
                    title='URL'
                    unstyled={unstyled}
                    value={item.url}
                    hideTitle
                    onChange={value => updateItem?.({url: value || ''})}
                    onKeyDown={(e) => {
                        const urls = formatUrl((e.target as HTMLInputElement).value, baseUrl, true);
                        updateItem?.({url: urls.save || ''});  
                    }}
                    onKeyUp={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const urls = formatUrl((e.target as HTMLInputElement).value, baseUrl, true);
                            updateItem?.({url: urls.save || ''});
                            addItem?.();
                        }
                        !!item.errors.url && clearError?.('url');
                    }}
                />
            </div>
            {action}
        </div>
    );
};

export default NavigationItemEditor;
