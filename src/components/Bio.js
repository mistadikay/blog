import React from 'react'

// Import typefaces
import 'typeface-montserrat'
import 'typeface-merriweather'

import profilePic from './profile-pic.jpg'
import { rhythm } from '../utils/typography'

class Bio extends React.Component {
  render() {
    return (
      <div
        style={{
          display: 'flex',
          marginBottom: rhythm(2.5),
        }}
      >
        <img
          src={profilePic}
          alt={`Denis Koltsov`}
          style={{
            marginRight: rhythm(1 / 2),
            marginBottom: 0,
            width: rhythm(2),
            height: rhythm(2),
          }}
        />
        <p>
          Hi, I'm{' '}
          <a href="https://mistadikay.com">
            <strong>Denis Koltsov</strong>
          </a>, a Russian software developer living in Stockholm, Sweden. I do
          things and I write stuff.
        </p>
      </div>
    )
  }
}

export default Bio
