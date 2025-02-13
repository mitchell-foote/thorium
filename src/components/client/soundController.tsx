import React, {Fragment, useEffect} from "react";
import gql from "graphql-tag.macro";
import {useSubscription} from "@apollo/client";
import {useSounds} from "../generic/SoundPlayer";

const SOUND_SUB = gql`
  subscription SoundSub($clientId: ID!) {
    soundSub(clientId: $clientId) {
      id
      url
      asset
      volume
      playbackRate
      channel
      looping
      preserveChannels
    }
  }
`;

const CANCEL_SOUNDS = gql`
  subscription CancelSounds($clientId: ID!) {
    cancelSound(clientId: $clientId)
  }
`;

const CANCEL_ALL_SOUNDS = gql`
  subscription CancelAllSounds($clientId: ID!) {
    cancelAllSounds(clientId: $clientId)
  }
`;

const STOP_LOOPING = gql`
  subscription CancelLooping($clientId: ID!) {
    cancelLoopingSounds(clientId: $clientId)
  }
`;

const SoundController = React.memo<{clientId: string}>(
  ({clientId}) => {
    const {playSound, stopLooping, removeSound, removeAllSounds} = useSounds();
    const soundSub = useSubscription(SOUND_SUB, {variables: {clientId}});
    const cancelSounds = useSubscription(CANCEL_SOUNDS, {variables: {clientId}});
    const cancelAllSounds = useSubscription(CANCEL_ALL_SOUNDS, {variables: {clientId}});
    const cancelLooping = useSubscription(STOP_LOOPING, {variables: {clientId}});
    useEffect(() => {
      if (soundSub.data?.soundSub) {
        playSound(soundSub.data?.soundSub)
      };
      if (cancelSounds.data?.cancelSound) {
        removeSound(cancelSounds.data?.cancelSound)
      };
      if (cancelAllSounds.data?.cancelAllSounds) {
        removeAllSounds()
      };
      if (cancelLooping.data?.cancelLoopingSounds) {
        stopLooping()
      };
    })
    return (
      <Fragment>
        {/* <Subscription subscription={SOUND_SUB} variables={{clientId}}>
          {({data}: {data?: any}) => {
            if (data?.soundSub) playSound(data?.soundSub);
            return null;
          }}
        </Subscription>
        <Subscription subscription={STOP_LOOPING} variables={{clientId}}>
          {({data}: {data?: any}) => {
            if (data?.cancelLoopingSounds) stopLooping();
            return null;
          }}
        </Subscription>
        <Subscription subscription={CANCEL_SOUNDS} variables={{clientId}}>
          {({data}: {data?: any}) => {
            if (data?.cancelSound) removeSound(data?.cancelSound);
            return null;
          }}
        </Subscription>
        <Subscription subscription={CANCEL_ALL_SOUNDS} variables={{clientId}}>
          {() => {
            removeAllSounds();
            return null;
          }}
        </Subscription> */}
      </Fragment>
    );
  },
  (prevProps: {clientId: string}, nextProps: {clientId: string}) => {
    return prevProps.clientId === nextProps.clientId;
  },
);

export default SoundController;
