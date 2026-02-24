import JsonView from '@uiw/react-json-view';
import { githubDarkTheme } from '@uiw/react-json-view/githubDark';
import { githubLightTheme } from '@uiw/react-json-view/githubLight';

import { useTheme } from '@flows/theme';

import { cn } from '../../utils';

export interface JsonViewerProps {
    data: unknown;
    maxHeight?: number | string;
    collapsed?: number | boolean;
    className?: string;
}

export const JsonViewer = ({ data, maxHeight = 180, collapsed = 2, className }: JsonViewerProps) => {
    const { isDarkTheme } = useTheme();

    return (
        <div className={cn('overflow-auto', className)} style={{ maxHeight }}>
            <JsonView
                value={(data ?? {}) as object}
                style={isDarkTheme ? githubDarkTheme : githubLightTheme}
                collapsed={collapsed}
                displayDataTypes={false}
                displayObjectSize={false}
                enableClipboard={false}
                editable={false}
            />
        </div>
    );
};
