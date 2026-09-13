// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0
'use client';

import { FormButton, type FormButtonProps } from '@lib/client/components/buttons/form.button';
import { Button } from '@lib/client/components/ui/button';
import {
  useBack,
  useParsed,
  useTranslation,
  type BaseRecord,
  type HttpError,
  useTranslate,
} from '@refinedev/core';
import type { UseFormReturnType } from '@refinedev/react-hook-form';
import {
  useId,
  type DetailedHTMLProps,
  type FormHTMLAttributes,
  type PropsWithChildren,
} from 'react';
import { type FieldValues, FormProvider, type UseFormReturn } from 'react-hook-form';
import { LoadingIcon } from '@lib/client/components/ui/loading';

type NativeFormProps = Omit<
  DetailedHTMLProps<FormHTMLAttributes<HTMLFormElement>, HTMLFormElement>,
  'onSubmit'
>;

export type FormProps<
  TQueryFnData extends BaseRecord = BaseRecord,
  TError extends HttpError = HttpError,
  TVariables extends FieldValues = FieldValues,
  TContext extends object = {},
  TData extends BaseRecord = TQueryFnData,
  TResponse extends BaseRecord = TData,
  TResponseError extends HttpError = TError,
> = PropsWithChildren &
  UseFormReturnType<TQueryFnData, TError, TVariables, TContext, TData, TResponse, TResponseError> &
  FormButtonProps & {
    formProps?: NativeFormProps;
    loading?: boolean;
    submitHandler?: (data: any) => void;
    cancelHandler?: () => void;
    hideCancel?: boolean;
    /// Suppress the built-in Save (submit) button. Useful when the
    /// consumer renders its own footer chrome (e.g. a wizard with
    /// Prev / Next / Save) and doesn't want the shared default
    /// button competing with the custom one.
    hideSubmit?: boolean;
    /// Called when react-hook-form's `handleSubmit` runs validation
    /// and finds errors. Without this, react-hook-form silently
    /// prevents the submit — a Confirm & Save button that "does
    /// nothing" is almost always an invalid form. Wire this to a
    /// toast or console.warn so the operator sees what's blocked.
    errorHandler?: (errors: Record<string, unknown>) => void;
    /// Override the className on the inner flex-column wrapper.
    /// Defaults to `flex flex-col gap-6 w-full`. Consumers with
    /// custom vertical layouts (e.g. a wizard whose footer must
    /// stay pinned while the section content scrolls) can pass
    /// `flex flex-col gap-6 w-full h-full min-h-0` to make the
    /// wrapper participate in a parent flex chain.
    contentClassName?: string;
    showFormErrors?: boolean; // for debugging form issues
  };

export const Form = <
  TQueryFnData extends BaseRecord = BaseRecord,
  TError extends HttpError = HttpError,
  TFieldValues extends FieldValues = FieldValues,
  TContext extends object = {},
  TData extends BaseRecord = TQueryFnData,
  TResponse extends BaseRecord = TData,
  TResponseError extends HttpError = TError,
>({
  formProps,
  loading,
  submitHandler,
  cancelHandler,
  showFormErrors,
  ...props
}: FormProps<TQueryFnData, TError, TFieldValues, TContext, TData, TResponse, TResponseError>) => {
  const formId = useId();
  const translate = useTranslate();
  const { action } = useParsed();
  const back = useBack();

  const onBack = action !== 'list' || typeof action !== 'undefined' ? back : undefined;

  const onSubmit = (data: TFieldValues) => {
    if (submitHandler) {
      submitHandler(data);
    } else {
      props.refineCore.onFinish(data).then();
    }
  };

  return (
    <FormProvider {...(props as unknown as UseFormReturn<TFieldValues, TContext, TFieldValues>)}>
      <form
        {...formProps}
        onSubmit={props.handleSubmit(onSubmit, (errors) =>
          props.errorHandler?.(errors as Record<string, unknown>),
        )}
        id={formId}
      >
        <div className={props.contentClassName ?? 'flex flex-col gap-6 w-full'}>
          {props.children}
          {showFormErrors && Object.keys(props.formState.errors).length > 0 && (
            <div className="text-destructive">{JSON.stringify(props.formState.errors)}</div>
          )}
          {(!props.hideCancel || !props.hideSubmit) && (
            <div className="flex items-center justify-end gap-4">
              {loading && <LoadingIcon className="size-6" />}
              {!props.hideCancel && (
                <Button
                  type="button"
                  onClick={() => {
                    if (cancelHandler) {
                      cancelHandler();
                    } else if (onBack) {
                      onBack();
                    }
                  }}
                  disabled={props.refineCore.formLoading || loading}
                  variant="outline"
                >
                  {translate('buttons.cancel')}
                </Button>
              )}
              {!props.hideSubmit && (
                <FormButton
                  submitButtonVariant={props.submitButtonVariant}
                  submitButtonLabel={props.submitButtonLabel}
                  type="submit"
                  loading={props.refineCore.formLoading || loading}
                  disabled={props.refineCore.formLoading || loading}
                />
              )}
            </div>
          )}
        </div>
      </form>
    </FormProvider>
  );
};
