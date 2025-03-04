import React from 'react';
import {Keyboard, StyleSheet, View} from 'react-native';
import AvatarWithDisplayName from '@components/AvatarWithDisplayName';
import Header from '@components/Header';
import Icon from '@components/Icon';
import * as Expensicons from '@components/Icon/Expensicons';
import PinButton from '@components/PinButton';
import PressableWithoutFeedback from '@components/Pressable/PressableWithoutFeedback';
import ThreeDotsMenu from '@components/ThreeDotsMenu';
import Tooltip from '@components/Tooltip';
import useKeyboardState from '@hooks/useKeyboardState';
import useLocalize from '@hooks/useLocalize';
import useStyleUtils from '@hooks/useStyleUtils';
import useTheme from '@hooks/useTheme';
import useThemeStyles from '@hooks/useThemeStyles';
import useThrottledButtonState from '@hooks/useThrottledButtonState';
import useWaitForNavigation from '@hooks/useWaitForNavigation';
import getButtonState from '@libs/getButtonState';
import Navigation from '@libs/Navigation/Navigation';
import CONST from '@src/CONST';
import ROUTES from '@src/ROUTES';
import type HeaderWithBackButtonProps from './types';

function HeaderWithBackButton({
    iconFill,
    guidesCallTaskID = '',
    onBackButtonPress = () => Navigation.goBack(ROUTES.HOME),
    onCloseButtonPress = () => Navigation.dismissModal(),
    onDownloadButtonPress = () => {},
    onThreeDotsButtonPress = () => {},
    report = null,
    policy,
    personalDetails = null,
    shouldShowAvatarWithDisplay = false,
    shouldShowBackButton = true,
    shouldShowBorderBottom = false,
    shouldShowCloseButton = false,
    shouldShowDownloadButton = false,
    shouldShowGetAssistanceButton = false,
    shouldDisableGetAssistanceButton = false,
    shouldShowPinButton = false,
    shouldShowThreeDotsButton = false,
    shouldDisableThreeDotsButton = false,
    stepCounter,
    subtitle = '',
    title = '',
    titleColor,
    threeDotsAnchorPosition = {
        vertical: 0,
        horizontal: 0,
    },
    threeDotsMenuItems = [],
    shouldEnableDetailPageNavigation = false,
    children = null,
    shouldOverlayDots = false,
    shouldOverlay = false,
    singleExecution = (func) => func,
    shouldNavigateToTopMostReport = false,
}: HeaderWithBackButtonProps) {
    const theme = useTheme();
    const styles = useThemeStyles();
    const StyleUtils = useStyleUtils();
    const [isDownloadButtonActive, temporarilyDisableDownloadButton] = useThrottledButtonState();
    const {translate} = useLocalize();
    const {isKeyboardShown} = useKeyboardState();
    const waitForNavigate = useWaitForNavigation();

    return (
        <View
            // Hover on some part of close icons will not work on Electron if dragArea is true
            // https://github.com/Expensify/App/issues/29598
            dataSet={{dragArea: false}}
            style={[styles.headerBar, shouldShowBorderBottom && styles.borderBottom, shouldShowBackButton && styles.pl2, shouldOverlay && StyleSheet.absoluteFillObject]}
        >
            <View style={[styles.dFlex, styles.flexRow, styles.alignItemsCenter, styles.flexGrow1, styles.justifyContentBetween, styles.overflowHidden]}>
                {shouldShowBackButton && (
                    <Tooltip text={translate('common.back')}>
                        <PressableWithoutFeedback
                            onPress={() => {
                                if (isKeyboardShown) {
                                    Keyboard.dismiss();
                                }
                                const topmostReportId = Navigation.getTopmostReportId();
                                if (shouldNavigateToTopMostReport && topmostReportId) {
                                    Navigation.navigate(ROUTES.REPORT_WITH_ID.getRoute(topmostReportId));
                                } else {
                                    onBackButtonPress();
                                }
                            }}
                            style={[styles.touchableButtonImage]}
                            role="button"
                            accessibilityLabel={translate('common.back')}
                            nativeID={CONST.BACK_BUTTON_NATIVE_ID}
                        >
                            <Icon
                                src={Expensicons.BackArrow}
                                fill={iconFill ?? theme.icon}
                            />
                        </PressableWithoutFeedback>
                    </Tooltip>
                )}
                {shouldShowAvatarWithDisplay ? (
                    <AvatarWithDisplayName
                        report={report}
                        policy={policy}
                        personalDetails={personalDetails}
                        shouldEnableDetailPageNavigation={shouldEnableDetailPageNavigation}
                    />
                ) : (
                    <Header
                        title={title}
                        subtitle={stepCounter ? translate('stepCounter', stepCounter) : subtitle}
                        textStyles={titleColor ? [StyleUtils.getTextColorStyle(titleColor)] : []}
                    />
                )}
                <View style={[styles.reportOptions, styles.flexRow, styles.pr5, styles.alignItemsCenter]}>
                    {children}
                    {shouldShowDownloadButton && (
                        <Tooltip text={translate('common.download')}>
                            <PressableWithoutFeedback
                                onPress={(event) => {
                                    // Blur the pressable in case this button triggers a Growl notification
                                    // We do not want to overlap Growl with the Tooltip (#15271)
                                    (event?.currentTarget as HTMLElement)?.blur();

                                    if (!isDownloadButtonActive) {
                                        return;
                                    }

                                    onDownloadButtonPress();
                                    temporarilyDisableDownloadButton();
                                }}
                                style={[styles.touchableButtonImage]}
                                role="button"
                                accessibilityLabel={translate('common.download')}
                            >
                                <Icon
                                    src={Expensicons.Download}
                                    fill={iconFill ?? StyleUtils.getIconFillColor(getButtonState(false, false, !isDownloadButtonActive))}
                                />
                            </PressableWithoutFeedback>
                        </Tooltip>
                    )}
                    {shouldShowGetAssistanceButton && (
                        <Tooltip text={translate('getAssistancePage.questionMarkButtonTooltip')}>
                            <PressableWithoutFeedback
                                disabled={shouldDisableGetAssistanceButton}
                                onPress={singleExecution(waitForNavigate(() => Navigation.navigate(ROUTES.GET_ASSISTANCE.getRoute(guidesCallTaskID, Navigation.getActiveRoute()))))}
                                style={[styles.touchableButtonImage]}
                                role="button"
                                accessibilityLabel={translate('getAssistancePage.questionMarkButtonTooltip')}
                            >
                                <Icon
                                    src={Expensicons.QuestionMark}
                                    fill={iconFill ?? theme.icon}
                                />
                            </PressableWithoutFeedback>
                        </Tooltip>
                    )}
                    {shouldShowPinButton && !!report && <PinButton report={report} />}
                    {shouldShowThreeDotsButton && (
                        <ThreeDotsMenu
                            disabled={shouldDisableThreeDotsButton}
                            menuItems={threeDotsMenuItems}
                            onIconPress={onThreeDotsButtonPress}
                            anchorPosition={threeDotsAnchorPosition}
                            shouldOverlay={shouldOverlayDots}
                        />
                    )}
                    {shouldShowCloseButton && (
                        <Tooltip text={translate('common.close')}>
                            <PressableWithoutFeedback
                                onPress={onCloseButtonPress}
                                style={[styles.touchableButtonImage]}
                                role={CONST.ROLE.BUTTON}
                                accessibilityLabel={translate('common.close')}
                            >
                                <Icon
                                    src={Expensicons.Close}
                                    fill={iconFill ?? theme.icon}
                                />
                            </PressableWithoutFeedback>
                        </Tooltip>
                    )}
                </View>
            </View>
        </View>
    );
}

HeaderWithBackButton.displayName = 'HeaderWithBackButton';

export default HeaderWithBackButton;
