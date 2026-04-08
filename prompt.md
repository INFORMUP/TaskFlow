Help build out the original design documentation for an application called TaskFlow, which is designed to be an agent-integrated task management application. 

# Teams

Distinct groups of people that interact with the task management system at different levels of engagement/permission.

Put a more detailed description of each, and proposals for alternative names, in docs/teams.md. Include proposals for additional teams, or a justification for not including others, in a distinct "Proposals" subsection. 

## Engineer

Develops, alongside agent, solutions.

## Product

Designs and reviews features.

## User

Downstream users of product. Able to surface bug reports and feature requests, but limited set of permissions beyond that. 


# Task Flows

Document goes in docs/taskflows.md

There are at least two task flows we want to include:
* Bugs
* Feature additions
Different task flows may require different status progressions. These include:

There may be more. Create these, any others you think would be useful, and whether they should have distinct status progressions, in docs/taskflows.md

## Bugs

Note that the exact statuses, their names, descriptions, and sequence, are up for debate if they are considered not desirable. Feel free to adjust if alternatives seem more valuable, or to keep them the same if they appear fine. 

Statuses could either be a progression, or different flows might move statuses back to previous statuses as appropriate. Give me your recommendations.


### Statuses

* Analyze - Has this bug been previously reported? Was it previously marked as resolved?
* Investigate - ID cause of bug, or if it is false positive
* Approve - Surface to engineer for approval
* Resolve - Execute solution via Red-Green Regression TDD with agent and possibly human-in-the-loop
* Validate - Surface to human and/or agent to confirm bug no longer occurs. Start with agent, then human.

## Feature Additions

* Discuss - Discuss with product team 
* Design - Design new feature
* Prototype - Build prototype for product review
* Implement - Execute solution with agent and possibly human-in-the-loop
* Validate - Surface to engineer  and/or agent to confirm 
* Review - Product performs final review to confirm it exists as expected

# Synchronization with Slack. 
* Create a document in docs/slack-integration.md detailing what this would require

# Permissions

Goes in docs/permissions.md

As is, this is vague and undefined and could use solidifying. A general idea is that different teams have different ability to initiate, review, and edit different task flows. This needs expanding.

# API Integration

Goes in docs/api.md

TaskFlow will need API endpoints to enable programmatic access by Claude Code and other applications. This includes viewing, creating, editing tasks, but may include other components (I defer to your suggestions).

Permissions may also be required.

# Database

Should derive naturally from other components. Preference is for normalized database following best-practices. Put in docs/db.md. Include mermaid ERD.

# Tech Stack

Preference is consistency with InformUp/dashboard-backend and InformUp/dashboard-frontend (on GitHub), and InformUp/RePortal, but open to alternatives if the benefits of alternatives outweigh the costs of inconsistency. 

# Other components

## IFrames/Google Docs

Interested in whether tasks and interactive components can be embeddable in IFrames or Google docs. 

## Claude Skills/MCP

As this develops, Claudian skills, agents or an MCP might be warranted, but be mindful of not doing overkill, especially in early stages. I think MCP is more at risk of being overkill than a skill or agent, but I defer to your judgment in the proposal.

## Integration with living spec website/service

This is very much a WIP, but note that we've been considering a system called "OpenSpec" for tracking specifications of repositories/services built. This may be integrated later on, but OpenSpec is still in early design stages. 