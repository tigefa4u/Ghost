import React, {Suspense, useMemo} from 'react';
import {useDesignSystem} from '../../providers/design-system-provider';
import {LoadingIndicator} from '../loading-indicator';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type KoenigModule = any;

const loadKoenig = (fetchKoenigLexical: () => Promise<KoenigModule>) => {
    let status = 'pending';
    let response: KoenigModule;

    const suspender = fetchKoenigLexical().then(
        (res) => {
            status = 'success';
            response = res;
        },
        (err) => {
            status = 'error';
            response = err;
        }
    );

    const read = () => {
        switch (status) {
        case 'pending':
            throw suspender;
        case 'error':
            throw response;
        default:
            return response;
        }
    };

    return {read};
};

type EditorResource = ReturnType<typeof loadKoenig>;

// Context to share the loaded koenig module
const KoenigContext = React.createContext<KoenigModule | null>(null);

const useKoenig = () => {
    const koenig = React.useContext(KoenigContext);
    if (!koenig) {
        throw new Error('useKoenig must be used within a KoenigComposer');
    }
    return koenig;
};

// Internal component that reads from the suspense resource
const KoenigLoader: React.FC<{
    editor: EditorResource;
    children: (koenig: KoenigModule) => React.ReactNode;
}> = ({editor, children}) => {
    const koenig = editor.read();
    return <>{children(koenig)}</>;
};

// Node type constants - these are identifiers that get resolved to actual nodes
export const EMAIL_EDITOR_NODES = 'EMAIL_NODES' as const;
export const DEFAULT_NODES = 'DEFAULT_NODES' as const;
export const BASIC_NODES = 'BASIC_NODES' as const;
export const MINIMAL_NODES = 'MINIMAL_NODES' as const;

export type NodeTypeIdentifier = typeof EMAIL_EDITOR_NODES | typeof DEFAULT_NODES | typeof BASIC_NODES | typeof MINIMAL_NODES;

export interface KoenigComposerProps {
    initialEditorState?: string;
    nodes?: NodeTypeIdentifier;
    darkMode?: boolean;
    onError?: (error: unknown) => void;
    children: React.ReactNode;
}

export const KoenigComposer: React.FC<KoenigComposerProps> = ({
    nodes = DEFAULT_NODES,
    children,
    ...props
}) => {
    const {fetchKoenigLexical} = useDesignSystem();
    const editorResource = useMemo(() => loadKoenig(fetchKoenigLexical), [fetchKoenigLexical]);

    return (
        <Suspense fallback={<LoadingIndicator delay={200} size="lg" />}>
            <KoenigLoader editor={editorResource}>
                {(koenig) => {
                    // Resolve node type identifier to actual nodes
                    const resolvedNodes = koenig[nodes];
                    return (
                        <KoenigContext.Provider value={koenig}>
                            <koenig.KoenigComposer {...props} nodes={resolvedNodes}>
                                {children}
                            </koenig.KoenigComposer>
                        </KoenigContext.Provider>
                    );
                }}
            </KoenigLoader>
        </Suspense>
    );
};

export interface KoenigEmailEditorProps {
    placeholderText?: string;
    onChange?: (editorState: unknown) => void;
    onBlur?: () => void;
    onFocus?: () => void;
}

export const KoenigEmailEditor: React.FC<KoenigEmailEditorProps> = (props) => {
    const koenig = useKoenig();
    return <koenig.KoenigEmailEditor {...props} />;
};
