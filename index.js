import { Octokit } from '@octokit/rest'
import inquirer from 'inquirer'
import inquirerPrompt from 'inquirer-autocomplete-prompt'
import inquirerCheckbox from 'inquirer-checkbox-plus-prompt'
import ora from 'ora'

inquirer.registerPrompt('checkbox-plus', inquirerCheckbox)

inquirer.registerPrompt('autocomplete', inquirerPrompt)
const spinner = ora('Loading')

if (process.env.GITHUB_TOKEN?.length < 0)
// eslint-disable-next-line no-throw-literal
	throw 'Please set GITHUB_TOKEN environment variable - https://github.com/settings/tokens/new'




const octokit = new Octokit({
	auth: process.env.GITHUB_TOKEN,
})


const selectConlusionEmoji = conclusion => {
	switch (conclusion) {
		case 'success':
			return '✅'
		case 'failure':
			return '❌'
		default:
			return ''
	}
}

const selectStatusEmoji = status => {
	switch (status) {
		case 'completed':
			return '🏁'
		case 'queued':
			return '⌛'
		default:
			return ''
	}
}

const categories = [ 'Merge PRs'/* , 'Report TS', 'Report unit test metrics' */ ]

const getOrganizations = async () => {
	spinner.start()

	spinner.color = 'yellow'
	spinner.text = 'Checking user'
	const { data: user } = await octokit.rest.users.getAuthenticated()


	spinner.color = 'green'
	spinner.text = 'Checking orgs'
	const { data: orgs } = await octokit.rest.orgs.listForUser({ username: user.login })

	spinner.stop()

	return orgs
}

const getRepos = async org => {
	spinner.start()

	spinner.color = 'red'
	spinner.text = 'Checking repos'
	const { data: repos1 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100 })
	const { data: repos2 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100,
		page: 2 })
	const { data: repos3 } = await octokit.rest.repos.listForOrg({ org,
		sort: 'full_name',
		per_page: 100,
		page: 3 })
    const { data: repos4 } = await octokit.rest.repos.listForOrg({ org,
        sort: 'full_name',
        per_page: 100,
        page: 4 })
	spinner.stop()

	return [ ...repos1, ...repos2, ...repos3 , ...repos4 ].filter(repo => repo.archived === false)
}


const getPrs = async ({ repo, owner, query }) => {
	spinner.start()

	spinner.color = 'magenta'
	spinner.text = 'Checking pulls'
	const { data: prs } = await octokit.rest.pulls.list({
		owner,
		repo,
        sort: 'updated',
        state: 'open',
        per_page: 100,
        head: query || '',
	})

	spinner.stop()


	return prs
}

const mergePRs = async () => {
	const organizations = await getOrganizations()
	const { Organization } = await inquirer
		.prompt([
			{ type: 'autocomplete',
				name: 'Organization',
				source: (answersSoFar, input = '') => organizations.map(({ login, ...rest }) => ({ name: login,
					...rest })).filter(({ name }) => name.includes(input)) },
		])

	const selectedOrg = organizations.find(({ login }) => login === Organization)
	const repos = await getRepos(selectedOrg.login)
	const repoTopics = Array.from(repos.reduce((memo, repo) => {
		repo.topics.forEach(topic => memo.add(topic))

		return memo
	}, new Set())).sort()

	// console.warn({ repoTopics })

	const { Topics } = await inquirer
		.prompt([ { type: 'checkbox-plus',
			name: 'Topics',
			message: 'Please select topics to filter',
			choices: repoTopics } ])




	const { Repos } = await inquirer
		.prompt([ { type: 'checkbox-plus',
			name: 'Repos',
			message: 'Please select repos',
			choices: repos.filter(repo => Topics?.length > 0 ? Topics.map(Topic => repo.topics.includes(Topic)).every(Boolean) : true) } ])

    const { Query } = await inquirer
        .prompt([ { type: 'checkbox-plus',
            name: 'Query',
            message: 'Enter search query',
            choices: repos.filter(repo => Topics?.length > 0 ? Topics.map(Topic => repo.topics.includes(Topic)).every(Boolean) : true) } ])


	const prs = (await Promise.all(repos.filter(repo => Repos.length > 0 ? Repos.includes(repo.name) : true).map(({ name }) => getPrs({ owner: Organization,
		repo: name })))).reduce((memo, repoPrs) => [ ...memo, ...repoPrs ], [])


	const labels = Array.from(prs.reduce((memo, pr) => {
		pr.labels.map(label => memo.add(label.name))

		return memo
	}, new Set()))


	const { Labels } = await inquirer
		.prompt([ { type: 'checkbox-plus',
			name: 'Labels',
			message: 'Please select labels to list PRs',
			choices: labels } ])
	let filteredPRs = prs.filter(pr => Labels.map(Label => pr.labels.find(({ name }) => name === Label)).every(Boolean))


	const checks = await Promise.all(filteredPRs.map(selectedPR => octokit.rest.checks.listSuitesForRef({
		owner: selectedOrg.login,
		repo: selectedPR.head.repo.name,
		ref: selectedPR.head.ref,
	})))

	filteredPRs = filteredPRs.map(selectedPR => {
		// eslint-disable-next-line camelcase
		const CircleChecks = checks.find(({ data: { check_suites } }) => check_suites.find(({ head_branch }) => head_branch === selectedPR.head.ref)).data.check_suites.filter(check => check.app.slug === 'circleci-checks')


		return { ...selectedPR,
			circleStatus: CircleChecks?.length > 0 ? CircleChecks.reduce((memo, { status }) => `${ memo ? memo + ',' : '' }${ status }`, '') : '',
			circleConclusion: CircleChecks?.length > 0 ? CircleChecks.reduce((memo, { conclusion }) => `${ memo ? memo + ',' : '' }${ conclusion }`, '') : '',
			checks: CircleChecks }
	})


	const { Merge } = await inquirer
		.prompt([ { type: 'checkbox-plus',
			name: 'Merge',
			message: 'Please select pr\'s to merge from list (Approve -> Merge if possible)',
			// eslint-disable-next-line camelcase
			choices: filteredPRs.map(({ title, html_url, ...others }) => ({ name: `[${ selectStatusEmoji(others.circleStatus) } ${ selectConlusionEmoji(others.circleConclusion) } ] ${ title } - ${ html_url }`,
				title,
				// eslint-disable-next-line camelcase
				html_url,
				...others })) } ])
	const selectedPrs = Merge.map(title => filteredPRs.find(pr => title.split(` - `)[1] === pr.html_url))

	await Promise.all(selectedPrs.map(async selectedPR => {
		let approve
		try {
			approve = await octokit.rest.pulls.createReview({ owner: selectedOrg.login,
				repo: selectedPR.head.repo.name,
				pull_number: selectedPR.number,
				event: 'APPROVE' })
			console.log('Approved - ', selectedPR.html_url)
		} catch (e) {
			console.warn(`Error approving PR ${ selectedPR.html_url }`, e.toString())
		}
		return approve
	}))


	await Promise.all(selectedPrs.map(async selectedPR => {
		let merge

		try {
			merge = await octokit.rest.pulls.merge({ owner: selectedOrg.login,
				repo: selectedPR.head.repo.name,
				pull_number: selectedPR.number })

			console.log('Merged - ', selectedPR.html_url)

		} catch (e) {
			console.warn(`Error merging PR ${ selectedPR.html_url }`, e.toString())
		}

		return merge
	}))



}

const index = function () {

	inquirer
		.prompt([
			{ type: 'list',
				name: 'Category',
				choices: categories },
		])
		.then(({ Category }) => {

			switch (Category) {
				case categories[0]:
					return mergePRs()
			}



			// Use user feedback for... whatever!!
		})
		.catch(error => {
			if (error.isTtyError)
				console.warn('Seems we can\'t render CLI here!')
			// Prompt couldn't be rendered in the current environment
			else
				console.warn('Something went wrong!', { error })
			// Something else went wrong

			throw error
		})


	return
}

export default index
