package session

import (
	"sort"
	"time"
)

func (store *Store) BuildTree(root Record) (Tree, error) {
	seen := map[string]bool{root.Meta.SessionID: true}
	rootNode := nodeFromRecord(root, "", "root")
	var attach func(*Node, Record)
	attach = func(parent *Node, rec Record) {
		type candidate struct {
			id, role, nickname string
			at                 time.Time
		}
		var candidates []candidate
		added := map[string]bool{}
		for _, spawn := range rec.ChildSpawns {
			if spawn.ChildSessionID != "" && !added[spawn.ChildSessionID] {
				added[spawn.ChildSessionID] = true
				candidates = append(candidates, candidate{spawn.ChildSessionID, spawn.AgentRole, spawn.AgentNickname, spawn.SpawnedAt})
			}
		}
		for _, entry := range store.ChildrenOf(parent.SessionID) {
			if !added[entry.SessionID] {
				added[entry.SessionID] = true
				candidates = append(candidates, candidate{entry.SessionID, entry.AgentRole, entry.AgentNickname, entry.StartedAt})
			}
		}
		type resolved struct {
			node    *Node
			rec     Record
			recurse bool
		}
		var children []resolved
		for _, candidate := range candidates {
			if seen[candidate.id] {
				continue
			}
			seen[candidate.id] = true
			childRec, err := store.Resolve(candidate.id)
			if err != nil && childRec.Status != StatusMalformed {
				started := candidate.at
				node := &Node{SessionID: candidate.id, ParentSessionID: parent.SessionID, AgentPath: pathSegment(candidate.nickname, candidate.role, candidate.id), StartedAt: &started, Status: StatusMissing, Confidence: ConfidenceNone}
				children = append(children, resolved{node: node})
				continue
			}
			node := nodeFromRecord(childRec, parent.SessionID, pathSegment(first(childRec.Meta.AgentNickname, candidate.nickname), first(childRec.Meta.AgentRole, candidate.role), candidate.id))
			if node.StartedAt == nil && !candidate.at.IsZero() {
				started := candidate.at
				node.StartedAt = &started
			}
			children = append(children, resolved{node, childRec, err == nil})
		}
		sort.SliceStable(children, func(i, j int) bool {
			a, b := nodeStart(children[i].node), nodeStart(children[j].node)
			if !a.Equal(b) {
				return a.Before(b)
			}
			return children[i].node.SessionID < children[j].node.SessionID
		})
		for _, child := range children {
			child.node.Depth = parent.Depth + 1
			child.node.AgentPath = parent.AgentPath + "/" + child.node.AgentPath
			parent.Children = append(parent.Children, child.node)
			if child.recurse {
				attach(child.node, child.rec)
			}
		}
	}
	attach(rootNode, root)
	order := 0
	tree := Tree{Root: rootNode}
	tree.Walk(func(node *Node) { node.Order = order; order++ })
	return tree, nil
}
func nodeFromRecord(rec Record, parent, path string) *Node {
	node := &Node{SessionID: rec.Meta.SessionID, ParentSessionID: parent, AgentPath: path, EndedAt: rec.EndedAt, Status: rec.Status, Model: rec.Meta.Model, Usage: rec.Usage, SourcePath: rec.SourcePath, Confidence: rec.Confidence}
	if !rec.Meta.StartedAt.IsZero() {
		at := rec.Meta.StartedAt
		node.StartedAt = &at
	}
	return node
}
func nodeStart(node *Node) time.Time {
	if node.StartedAt == nil {
		return time.Time{}
	}
	return *node.StartedAt
}
func pathSegment(nickname, role, id string) string {
	if nickname != "" {
		return nickname
	}
	if role != "" {
		return role
	}
	if len(id) > 8 {
		return id[:8]
	}
	return id
}
func first(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func Export(tree Tree) ExportDoc {
	doc := ExportDoc{Schema: SchemaSessionTreeV1, Nodes: []ExportNode{}}
	tree.Walk(func(node *Node) {
		doc.Nodes = append(doc.Nodes, ExportNode{node.SessionID, node.ParentSessionID, node.AgentPath, utc(node.StartedAt), utc(node.EndedAt), node.Status, node.Depth, node.Order, node.Model, node.Usage, node.SourcePath, node.Confidence})
	})
	return doc
}
func utc(value *time.Time) *time.Time {
	if value == nil {
		return nil
	}
	v := value.UTC()
	return &v
}
